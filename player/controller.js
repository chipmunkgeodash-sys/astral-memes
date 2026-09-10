(function () {
  "use strict";

  if (window.__astralControllerInstalled) return;
  window.__astralControllerInstalled = true;

  var BUTTON_THRESHOLD = 0.55;
  var STICK_THRESHOLD = 0.42;
  var pressedKeys = new Map();
  var connectedId = "";
  var lastMode = "";
  var pointerX = window.innerWidth / 2;
  var pointerY = window.innerHeight / 2;
  var pointerActive = false;
  var pointerDown = false;
  var pointerTarget = null;
  var bridgedPad = null;
  var emulatorInputs = new Map();

  var keyDetails = {
    ArrowLeft: ["ArrowLeft", 37],
    ArrowUp: ["ArrowUp", 38],
    ArrowRight: ["ArrowRight", 39],
    ArrowDown: ["ArrowDown", 40],
    Enter: ["Enter", 13],
    Escape: ["Escape", 27],
    Tab: ["Tab", 9],
    Shift: ["ShiftLeft", 16],
    Control: ["ControlLeft", 17],
    " ": ["Space", 32],
    a: ["KeyA", 65],
    c: ["KeyC", 67],
    d: ["KeyD", 68],
    e: ["KeyE", 69],
    f: ["KeyF", 70],
    g: ["KeyG", 71],
    h: ["KeyH", 72],
    i: ["KeyI", 73],
    j: ["KeyJ", 74],
    k: ["KeyK", 75],
    l: ["KeyL", 76],
    q: ["KeyQ", 81],
    r: ["KeyR", 82],
    s: ["KeyS", 83],
    t: ["KeyT", 84],
    v: ["KeyV", 86],
    w: ["KeyW", 87],
    x: ["KeyX", 88],
    z: ["KeyZ", 90]
  };

  function isEmulatorGame() {
    return Boolean(
      window.EJS_gameUrl ||
      window.EJS_core ||
      document.querySelector("#game canvas.emulator") ||
      Array.prototype.some.call(document.scripts, function (script) {
        return /emulatorjs/i.test(script.src || "");
      })
    );
  }

  function sendStatus(status, pad) {
    var mode = isEmulatorGame() ? "emulator" : "mapped";
    if (status === "connected" && connectedId === pad.id && lastMode === mode) return;
    connectedId = status === "connected" ? pad.id : "";
    lastMode = status === "connected" ? mode : "";
    window.parent.postMessage({
      type: "astral-controller",
      status: status,
      name: pad ? pad.id : "",
      mode: mode
    }, "https://astral-memes.web.app");
  }

  function keyboardEvent(type, key) {
    var details = keyDetails[key];
    if (!details) return;
    var event = new KeyboardEvent(type, {
      key: key,
      code: details[0],
      bubbles: true,
      cancelable: true
    });
    try {
      Object.defineProperty(event, "keyCode", { get: function () { return details[1]; } });
      Object.defineProperty(event, "which", { get: function () { return details[1]; } });
    } catch (_) {}
    var target = document.activeElement || document.body || document.documentElement;
    target.dispatchEvent(event);
  }

  function syncKeys(nextKeys) {
    pressedKeys.forEach(function (_, key) {
      if (!nextKeys.has(key)) {
        keyboardEvent("keyup", key);
        pressedKeys.delete(key);
      }
    });
    nextKeys.forEach(function (key) {
      if (!pressedKeys.has(key)) {
        keyboardEvent("keydown", key);
        pressedKeys.set(key, true);
      }
    });
  }

  function addMovement(keys, left, right, up, down) {
    if (left) { keys.add("ArrowLeft"); keys.add("a"); }
    if (right) { keys.add("ArrowRight"); keys.add("d"); }
    if (up) { keys.add("ArrowUp"); keys.add("w"); }
    if (down) { keys.add("ArrowDown"); keys.add("s"); }
  }

  function button(pad, index) {
    var value = pad.buttons[index];
    return Boolean(value && (value.pressed || value.value > BUTTON_THRESHOLD));
  }

  function mappedKeys(pad) {
    var keys = new Set();
    var x = pad.axes[0] || 0;
    var y = pad.axes[1] || 0;
    addMovement(
      keys,
      button(pad, 14) || x < -STICK_THRESHOLD,
      button(pad, 15) || x > STICK_THRESHOLD,
      button(pad, 12) || y < -STICK_THRESHOLD,
      button(pad, 13) || y > STICK_THRESHOLD
    );
    if (button(pad, 0)) keys.add(" ");
    if (button(pad, 1)) keys.add("x");
    if (button(pad, 2)) keys.add("z");
    if (button(pad, 3)) keys.add("c");
    if (button(pad, 4)) keys.add("q");
    if (button(pad, 5)) keys.add("e");
    if (button(pad, 6)) keys.add("Control");
    if (button(pad, 7)) keys.add("Shift");
    if (button(pad, 8)) keys.add("Escape");
    if (button(pad, 9)) keys.add("Enter");
    return keys;
  }

  function emulatorKeys(pad) {
    var keys = new Set();
    var x = pad.axes[0] || 0;
    var y = pad.axes[1] || 0;
    if (button(pad, 14)) keys.add("ArrowLeft");
    if (button(pad, 15)) keys.add("ArrowRight");
    if (button(pad, 12)) keys.add("ArrowUp");
    if (button(pad, 13)) keys.add("ArrowDown");
    if (x < -STICK_THRESHOLD) keys.add("f");
    if (x > STICK_THRESHOLD) keys.add("h");
    if (y < -STICK_THRESHOLD) keys.add("t");
    if (y > STICK_THRESHOLD) keys.add("g");
    var rx = pad.axes[2] || 0;
    var ry = pad.axes[3] || 0;
    if (rx < -STICK_THRESHOLD) keys.add("j");
    if (rx > STICK_THRESHOLD) keys.add("l");
    if (ry < -STICK_THRESHOLD) keys.add("i");
    if (ry > STICK_THRESHOLD) keys.add("k");
    if (button(pad, 0)) keys.add("z");
    if (button(pad, 1)) keys.add("x");
    if (button(pad, 2)) keys.add("a");
    if (button(pad, 3)) keys.add("s");
    if (button(pad, 4)) keys.add("q");
    if (button(pad, 5)) keys.add("e");
    if (button(pad, 6)) keys.add("Tab");
    if (button(pad, 7)) keys.add("r");
    if (button(pad, 8)) keys.add("v");
    if (button(pad, 9)) keys.add("Enter");
    return keys;
  }

  function emulatorButtons(pad) {
    var inputs = new Set();
    var x = pad.axes[0] || 0;
    var y = pad.axes[1] || 0;
    var rx = pad.axes[2] || 0;
    var ry = pad.axes[3] || 0;
    if (button(pad, 0)) inputs.add(8);
    if (button(pad, 1)) inputs.add(0);
    if (button(pad, 2)) inputs.add(9);
    if (button(pad, 3)) inputs.add(1);
    if (button(pad, 4)) inputs.add(10);
    if (button(pad, 5)) inputs.add(11);
    if (button(pad, 6)) inputs.add(12);
    if (button(pad, 7)) inputs.add(13);
    if (button(pad, 8)) inputs.add(2);
    if (button(pad, 9)) inputs.add(3);
    if (button(pad, 10)) inputs.add(14);
    if (button(pad, 11)) inputs.add(15);
    if (button(pad, 12)) inputs.add(4);
    if (button(pad, 13)) inputs.add(5);
    if (button(pad, 14)) inputs.add(6);
    if (button(pad, 15)) inputs.add(7);
    if (x > STICK_THRESHOLD) inputs.add(16);
    if (x < -STICK_THRESHOLD) inputs.add(17);
    if (y > STICK_THRESHOLD) inputs.add(18);
    if (y < -STICK_THRESHOLD) inputs.add(19);
    if (rx > STICK_THRESHOLD) inputs.add(20);
    if (rx < -STICK_THRESHOLD) inputs.add(21);
    if (ry > STICK_THRESHOLD) inputs.add(22);
    if (ry < -STICK_THRESHOLD) inputs.add(23);
    return inputs;
  }

  function simulatePlayerOne(index, value) {
    var manager = window.EJS_emulator && window.EJS_emulator.gameManager;
    if (!manager || typeof manager.simulateInput !== "function") return false;
    try {
      manager.simulateInput(0, index, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function syncEmulatorInputs(nextInputs) {
    emulatorInputs.forEach(function (_, index) {
      if (!nextInputs.has(index) && simulatePlayerOne(index, 0)) emulatorInputs.delete(index);
    });
    nextInputs.forEach(function (index) {
      if (!emulatorInputs.has(index) && simulatePlayerOne(index, 1)) emulatorInputs.set(index, true);
    });
  }

  function pointerEvent(type, target) {
    if (!target) return;
    var options = {
      bubbles: true,
      cancelable: true,
      clientX: pointerX,
      clientY: pointerY,
      button: 0,
      buttons: type === "mouseup" || type === "pointerup" || type === "click" ? 0 : 1,
      pointerType: "mouse",
      isPrimary: true
    };
    if (/^pointer/.test(type) && window.PointerEvent) target.dispatchEvent(new PointerEvent(type, options));
    else target.dispatchEvent(new MouseEvent(type, options));
  }

  function cursor() {
    var node = document.getElementById("astral-controller-cursor");
    if (!node) {
      node = document.createElement("div");
      node.id = "astral-controller-cursor";
      node.style.cssText = "position:fixed;left:0;top:0;z-index:2147483646;width:18px;height:18px;border:2px solid white;border-radius:50%;background:rgba(117,124,255,.45);box-shadow:0 2px 12px rgba(0,0,0,.65);pointer-events:none;display:none;transform:translate(-50%,-50%)";
      (document.body || document.documentElement).appendChild(node);
    }
    return node;
  }

  function releasePointer() {
    if (pointerDown) {
      pointerEvent("pointerup", pointerTarget);
      pointerEvent("mouseup", pointerTarget);
      pointerEvent("click", pointerTarget);
    }
    pointerDown = false;
    pointerTarget = null;
  }

  function syncPointer(pad) {
    var x = pad.axes[2] || 0;
    var y = pad.axes[3] || 0;
    var moving = Math.abs(x) > 0.2 || Math.abs(y) > 0.2;
    if (moving) {
      pointerActive = true;
      pointerX = Math.max(0, Math.min(window.innerWidth - 1, pointerX + x * 14));
      pointerY = Math.max(0, Math.min(window.innerHeight - 1, pointerY + y * 14));
      var node = cursor();
      node.style.display = "block";
      node.style.left = pointerX + "px";
      node.style.top = pointerY + "px";
      pointerTarget = document.elementFromPoint(pointerX, pointerY);
      pointerEvent("pointermove", pointerTarget);
      pointerEvent("mousemove", pointerTarget);
    }
    if (!pointerActive) return;
    var clickPressed = button(pad, 0) || button(pad, 7);
    if (clickPressed && !pointerDown) {
      pointerTarget = document.elementFromPoint(pointerX, pointerY);
      pointerEvent("pointerdown", pointerTarget);
      pointerEvent("mousedown", pointerTarget);
      pointerDown = true;
    } else if (!clickPressed && pointerDown) {
      releasePointer();
    }
  }

  function frame() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var localPad = Array.prototype.find.call(pads, function (item) { return item && item.connected; });
    var pad = bridgedPad || localPad;
    if (!pad) {
      if (connectedId) sendStatus("disconnected", null);
      syncKeys(new Set());
      syncEmulatorInputs(new Set());
      releasePointer();
    } else {
      sendStatus("connected", pad);
      if (isEmulatorGame()) {
        syncKeys(emulatorKeys(pad));
        syncEmulatorInputs(emulatorButtons(pad));
        releasePointer();
      } else {
        syncEmulatorInputs(new Set());
        syncKeys(mappedKeys(pad));
        syncPointer(pad);
      }
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener("gamepadconnected", function (event) {
    sendStatus("connected", event.gamepad);
  });
  window.addEventListener("gamepaddisconnected", function () {
    syncKeys(new Set());
    releasePointer();
  });
  window.addEventListener("blur", function () {
    syncKeys(new Set());
    syncEmulatorInputs(new Set());
    releasePointer();
  });
  window.addEventListener("message", function (event) {
    var allowed = event.origin === "https://astral-memes.web.app" || /^http:\/\/localhost:\d+$/.test(event.origin);
    if (!allowed || !event.data || event.data.type !== "astral-gamepad-state") return;
    bridgedPad = event.data.pad || null;
  });

  requestAnimationFrame(frame);
})();
