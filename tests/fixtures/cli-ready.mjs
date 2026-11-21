// SPDX-License-Identifier: GPL-3.0-only
// This final preload releases Node's normal CLI entry point after startup.
await new Promise((resolve, reject) => {
  process.once('message', message => {
    if (message !== 'run') { reject(new Error('invalid CLI start message')); return; }
    process.send('starting', error => {
      if (error) { reject(error); return; }
      process.disconnect();
      resolve();
    });
  });
  process.send('ready', error => { if (error) reject(error); });
});
