"""Record every phrase in voice/phrases.json to voice/clips/<key>.mp3 and list them in voice/manifest.json.
Already-recorded clips are kept, so only new sentences are recorded on later runs."""
import json, os, subprocess, sys, wave

from piper import PiperVoice

model = sys.argv[1]
phrases = json.load(open('voice/phrases.json'))
os.makedirs('voice/clips', exist_ok=True)
voice = PiperVoice.load(model)
done, failed = [], []
for p in phrases:
    mp3 = f"voice/clips/{p['key']}.mp3"
    if not os.path.exists(mp3):
        wav = '/tmp/clip.wav'
        try:
            with wave.open(wav, 'wb') as w:
                voice.synthesize(p['text'], w, length_scale=1.08, sentence_silence=0.05)  # a touch slower for a 4-year-old
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-ac', '1', '-b:a', '64k', mp3], check=True)
        except Exception as e:  # keep going: one bad sentence shouldn't stop the rest
            print('FAILED', p['text'], e)
            failed.append(p['text'])
            continue
    done.append(p['key'])
json.dump(sorted(done), open('voice/manifest.json', 'w'))
print(f'recorded {len(done)} of {len(phrases)} phrases; failed {len(failed)}')
