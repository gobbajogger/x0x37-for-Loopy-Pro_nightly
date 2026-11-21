-- SPDX-License-Identifier: GPL-3.0-only
-- Drive the actual scripts extracted from the packed layout. Only Hexler's
-- control and MIDI callbacks are provided here; the counterpart is x0x_host.
local scripts, mode, channel = arg[1], arg[2], tonumber(arg[3])
local controls, sent = {}, {}
for name in io.lines(scripts .. "/controls.txt") do
    controls[name] = {name = name, values = {}}
end
root = {
    findByName = function(_, name) return controls[name] end,
    notify = function(_, key, value) onReceiveNotify(key, value) end,
}
function getMillis() return 0 end
function Color(r, g, b, a) return {r, g, b, a} end
function sendMIDI(message, connections)
    assert(#connections == 10 and connections[1])
    for i = 2, 10 do assert(connections[i] == false) end
    sent[#sent + 1] = message
end
dofile(scripts .. "/controller.lua")
dofile(scripts .. "/button.lua")
init()

local function press(name, down)
    self = assert(controls[name], "missing packed button: " .. name)
    self.values.x = down and 1 or 0
    onValueChanged("x")
end
local function selectChannel(from, to)
    local button = from < to and "channel_up" or "channel_down"
    for _ = 1, math.abs(to - from) do press(button, true); press(button, false) end
end
selectChannel(2, channel)

if mode == "send" then
    local note = tonumber(arg[4])
    local name = "note_" .. note
    press(name, true)
    press(name, false)
    assert(#sent == 0, "disarmed output")
    press("arm", true)
    press(name, true)
    press(name, true)
    assert(#sent == 1, "a held button must emit one Note On")
    -- Exercise note release, the RELEASE button and original-channel release.
    if note % 3 == 0 then
        press(name, false)
    elseif note % 3 == 1 then
        press("disarm", true)
        press(name, false)
    else
        selectChannel(channel, channel - 1)
        press(name, false)
    end
    assert(#sent == 2)
    for i, m in ipairs(sent) do
        local status = (i == 1 and 0x90 or 0x80) + channel - 1
        assert(#m == 3 and m[1] == status and m[2] == note and m[3] == (i == 1 and 100 or 0))
        print(string.format("midi %02X %02X %02X 0", m[1], m[2], m[3]))
    end
elseif mode == "receive" then
    local on, off = 0, 0
    local function feedback() return controls.feedback.values.text end
    for line in io.lines(arg[4]) do
        local a, b, c = line:match("^%d+ ms: (%x%x) (%x%x) (%x%x)$")
        assert(a, "malformed host MIDI log: " .. line)
        local status, note, velocity = tonumber(a, 16), tonumber(b, 16), tonumber(c, 16)
        local message = {status, note, velocity}
        local before = feedback()
        onReceiveMIDI(message, {false, true})
        assert(feedback() == before, "wrong connection updated feedback")
        onReceiveMIDI(message, {true})
        if (status == 0x90 + channel - 1 or status == 0x80 + channel - 1) and note == 36 then
            local down = status >= 0x90 and velocity > 0
            local v = down and velocity or 0
            local expected = string.format("Received CH %d note %d velocity %d", channel, note, v)
            assert(feedback() == expected)
            assert(controls.note_36.color[1] == (down and 0.55 or 0.16))
            if down then on = on + 1 else off = off + 1 end
        elseif status % 16 ~= channel - 1 or status >= 0xA0 then
            assert(feedback() == before, "irrelevant firmware message changed feedback")
        end
    end
    assert(on > 0 and off == on and #sent == 0, "missing or echoed host note lifecycle")
    print(string.format("firmware -> TouchOSC: %d kick Note On/Off pairs, no echo", on))
else
    error("unknown mode")
end
