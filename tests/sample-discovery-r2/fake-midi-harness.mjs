// SPDX-License-Identifier: GPL-3.0-only
// Fake endpoints only. The exact Link + connect source is evaluated unchanged.
export const INFO_X0X = [...Array.from('X0X DEV', c => c.charCodeAt(0)), 0, 0, 0, 0, 64, 0, 0];
export function extract(html) {
  const start = html.indexOf('class Link {');
  const end = html.indexOf('\nfunction unpack7(', start);
  if (start < 0 || end < 0) throw new Error('Missing exact Link/connect source');
  return html.slice(start, end);
}
function check(condition, message) { if (!condition) throw new Error(message); }
export function environment(source, specs) {
  const events = [], ports = [], timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, Math.min(ms, 2)); timers.add(t); return t; };
  const cancel = t => { timers.delete(t); clearTimeout(t); };
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i], name = spec.name || `DnBOX SMK-37 Pro candidate ${i}`;
    const pair = {};
    for (const type of ['input', 'output']) {
      const port = pair[type] = {
        id: `${type}-${i}`, name, manufacturer: 'Synthetic', type,
        state: spec[`${type}Disconnected`] ? 'disconnected' : 'connected',
        connection: spec.preopened ? 'open' : 'closed',
        onmidimessage: type === 'input' ? (spec.previousHandler || null) : null,
        onstatechange: null,
        async open() {
          events.push(`${i}:${type}:open`);
          if (spec[`${type}Reject`]) throw new Error(`${type} open rejected`);
          this.connection = 'open'; return this;
        },
        async close() {
          events.push(`${i}:${type}:close`);
          this.connection = 'closed';
          if (spec.closeReject) throw new Error('close rejected');
          return this;
        },
        send(data) {
          check(type === 'output' && this.connection === 'open', 'send requires open fake output');
          check(data.join(',') === '240,125,70,76,1,247', 'only synthetic identity request is allowed');
          events.push(`${i}:identity`);
          if (spec.sendReject) throw new Error('fake send rejected');
          if (spec.silent) return;
          queueMicrotask(() => {
            if (spec.wrongIdentity) pair.input.onmidimessage?.({data: Uint8Array.of(240,125,70,77,1,247)});
            else pair.input.onmidimessage?.({data: Uint8Array.of(240,125,70,76,1,...(spec.payload ?? INFO_X0X),247)});
          });
        }
      };
    }
    ports.push(pair);
  }
  const midi = {inputs:new Map(ports.map(p=>[p.input.id,p.input])), outputs:new Map(ports.map(p=>[p.output.id,p.output])), onstatechange:null, sysexEnabled:true};
  const navigator = {async requestMIDIAccess(options) { check(options.sysex === true, 'existing sysex option preserved'); events.push('fake-access'); return midi; }};
  const api = new Function('navigator','setTimeout','clearTimeout', `const HDR=[0x7D,0x46,0x4C]; let link=null,readOk=false; function render(){} function say(){}\n${source}\nreturn {connect};`)(navigator, later, cancel);
  return {...api, ports, events, timers, midi};
}
export async function scenario(source, name, specs, expectedIndex, options={}) {
  const env = environment(source, specs);
  let link, error;
  try { link = await env.connect(); } catch (e) { error = e.message; }
  if (expectedIndex === null) check(!link && /No SMK-37 running DnBOX found/.test(error), `${name}: expected final not-found, got ${error || 'success'}`);
  else {
    check(link?.input === env.ports[expectedIndex].input, `${name}: expected later successful candidate ${expectedIndex}, got ${error || 'wrong candidate'}`);
    check(link.output === env.ports[expectedIndex].output, `${name}: selected wrong output`);
    check(link.input.connection === 'open' && link.output.connection === 'open', `${name}: successful ports closed`);
    check(typeof link.input.onmidimessage === 'function', `${name}: successful listener lost`);
    check(link.wait === null, `${name}: successful request still pending`);
  }
  for (let i=0; i<specs.length; i++) {
    if (i === expectedIndex) continue;
    const spec = specs[i], pair = env.ports[i];
    const skipped = spec.inputDisconnected || spec.outputDisconnected || spec.unmatched;
    if (skipped) check(!env.events.some(e=>e.startsWith(`${i}:`)), `${name}: disconnected/unmatched candidate touched`);
    else if (!spec.preopened && (expectedIndex === null || i < expectedIndex)) {
      check(pair.input.connection === 'closed' && pair.output.connection === 'closed', `${name}: failed ports leaked`);
      check(pair.input.onmidimessage === (spec.previousHandler || null), `${name}: failed listener leaked`);
    } else if (spec.preopened) {
      check(pair.input.connection === 'open' && pair.output.connection === 'open', `${name}: preexisting ports closed`);
      check(pair.input.onmidimessage === spec.previousHandler, `${name}: preexisting listener not restored`);
      check(!env.events.some(e=>e.startsWith(`${i}:`) && e.endsWith(':close')), `${name}: preexisting port close attempted`);
    }
  }
  check(env.timers.size === 0, `${name}: timer leaked`);
  if (options.noLater) check(!env.events.some(e=>e.startsWith('1:')), `${name}: attempted a later candidate after success`);
  return {name,status:'PASS',events:env.events,error:error || null};
}
export async function matrix(source) {
  const prior = () => {};
  const cases = [
    ['input-open rejection then good', [{inputReject:true},{}], 1],
    ['output-open rejection after input success then good', [{outputReject:true},{}], 1],
    ['failed handshake then good', [{silent:true},{}], 1],
    ['wrong handshake identity then good', [{wrongIdentity:true},{}], 1],
    ['send throws then good', [{sendReject:true},{}], 1],
    ['disconnected input skipped', [{inputDisconnected:true},{}], 1],
    ['disconnected output skipped', [{outputDisconnected:true},{}], 1],
    ['all candidates fail', [{inputReject:true},{outputReject:true},{silent:true}], null],
    ['success retained and later candidate untouched', [{},{}], 0, {noLater:true}],
    ['preopened ports and listener preserved after failure', [{preopened:true,previousHandler:prior,silent:true},{}], 1],
    ['cleanup rejection does not abort discovery', [{outputReject:true,closeReject:true},{}], 1],
    ['empty port list', [], null],
    ['legacy X0X naming still succeeds', [{name:'X0X legacy'}], 0],
    ['legacy Felucca naming still succeeds', [{name:'Felucca legacy'}], 0],
    ['DnBOX 25.1 naming still succeeds', [{name:'DnBOX 37PRO'}], 0],
    ['DnBOX 0.0.26 naming still succeeds', [{name:'DnBOX SMK-37 Elite'}], 0]
  ];
  const results=[];
  for (const [name,specs,index,options] of cases) results.push(await scenario(source,name,specs,index,options));
  return results;
}
export async function handshakeMatrix(source) {
  const ascii = s => Array.from(s, c => c.charCodeAt(0));
  const cases = [
    ['echoed request is not INFO', [], 1],
    ['unterminated version rejected', ascii('X0X DEV'), 1],
    ['version-only INFO rejected', [...ascii('X0X DEV'),0], 1],
    ['truncated fixed fields rejected', INFO_X0X.slice(0,-1), 1],
    ['foreign firmware rejected despite matching port name', [...ascii('OTHER DEV'),0,0,0,0,64,0,0], 1],
    ['non-7bit INFO rejected', [...INFO_X0X.slice(0,-1),128], 1],
    ['zero step count rejected', [...ascii('X0X DEV'),0,0,0,0,0,0,0], 1],
    ['unknown trailing data rejected', [...INFO_X0X,1], 1],
    ['current main XSG extension retained', [...INFO_X0X,88,83,71,1,48], 0],
    ['unsupported XSG extension rejected', [...INFO_X0X,88,83,71,2,48], 1],
    ['X0X 25.1 identity retained', [...ascii('X0X 25.1'),0,0,0,0,64,0,0], 0],
    ['X0X 0.0.26 identity retained', [...ascii('X0X 0.0.26'),0,0,0,0,64,0,0], 0],
    ['FELUCCA legacy optional track field retained', [...ascii('FELUCCA 0.9-beta'),0,2,12,8,16,4,...ascii('SYNTH'),0,...ascii('DRUM'),0,4], 0],
    ['FELUCCA older no-track schema retained', [...ascii('FELUCCA 0.9-beta'),0,2,12,8,16,4,...ascii('SYNTH'),0,...ascii('DRUM'),0], 0],
    ['truncated FELUCCA engine names rejected', [...ascii('FELUCCA 0.9-beta'),0,2,12,8,16,4,...ascii('SYNTH'),0], 1]
  ];
  const results=[];
  for(const [name,payload,index] of cases) results.push(await scenario(source,name,[{payload},{}],index));
  results.push(await scenario(source,'all malformed INFO yields final discovery failure',[{payload:[]},{payload:[0]}],null));
  return results;
}
