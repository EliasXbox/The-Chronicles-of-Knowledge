// Web edition based on the Android export: use its M4A audio on every device.
AudioManager.audioFileExt = function() { return '.m4a'; };
// Use MV's own scaling so pointer coordinates match the visible canvas.
Graphics._defaultStretchMode = function() { return true; };
