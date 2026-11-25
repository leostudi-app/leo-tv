"""Record one sample sentence in several Piper voices so a grown-up can pick LEO's voice."""
import json, subprocess, sys, wave, os
from piper import PiperVoice

TEXT = "Hello Leo! Can you find number three? Brilliant! You're a superstar!"
os.makedirs('voice/samples', exist_ok=True)
for model in sys.argv[1:]:
    name = os.path.basename(model).replace('.onnx', '')
    cfg = json.load(open(model + '.json'))
    voice = PiperVoice.load(model)
    speakers = cfg.get('speaker_id_map') or {'': None}
    for spk, sid in list(speakers.items())[:4]:
        out = f"voice/samples/{name}{('-' + spk) if spk else ''}.mp3"
        with wave.open('/tmp/s.wav', 'wb') as w:
            kw = {'length_scale': 1.08}
            if sid is not None: kw['speaker_id'] = sid
            voice.synthesize(TEXT, w, **kw)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', '/tmp/s.wav', '-ac', '1', '-b:a', '64k', out], check=True)
        print('made', out)
