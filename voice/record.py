"""Record every phrase in voice/phrases.json to voice/clips/<key>.mp3 and list them in voice/manifest.json.
Already-recorded clips are kept, so only new sentences are recorded on later runs."""
import json, os, subprocess, sys, wave

from piper import PiperVoice

model = sys.argv[1]
speaker = sys.argv[2] if len(sys.argv) > 2 else ''
phrases = json.load(open('voice/phrases.json'))
os.makedirs('voice/clips', exist_ok=True)
voice = PiperVoice.load(model)
cfg = json.load(open(model + '.json'))
speaker_id = (cfg.get('speaker_id_map') or {}).get(speaker) if speaker else None
# A different voice means every clip is re-recorded.
voice_id = os.path.basename(model) + ('/' + speaker if speaker else '')
marker = 'voice/clips/VOICE.txt'
if not os.path.exists(marker) or open(marker).read().strip() != voice_id:
    for f in os.listdir('voice/clips'):
        os.remove(os.path.join('voice/clips', f))
    open(marker, 'w').write(voice_id)
print('voice:', voice_id, 'speaker id', speaker_id)
# Optional respellings so names are said properly (e.g. {"Seraphina": "Sera-feena"}); the clip key still uses the real text.
say_as = json.load(open('voice/say-as.json')) if os.path.exists('voice/say-as.json') else {}
for word in ['Seraphina'] + list(say_as.values()):
    try: print('phonemes', word, '->', ' '.join(''.join(s) for s in voice.phonemize(word)))
    except Exception as e: print('phonemes', word, 'failed', e)
def spoken(text):
    for k, v in say_as.items(): text = text.replace(k, v)
    return text
done, failed = [], []
for p in phrases:
    mp3 = f"voice/clips/{p['key']}.mp3"
    if not os.path.exists(mp3):
        wav = '/tmp/clip.wav'
        try:
            with wave.open(wav, 'wb') as w:
                kw = {'length_scale': 1.08, 'sentence_silence': 0.05}  # a touch slower for a 4-year-old
                if speaker_id is not None: kw['speaker_id'] = speaker_id
                voice.synthesize(spoken(p['text']), w, **kw)
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-ac', '1', '-b:a', '64k', mp3], check=True)
        except Exception as e:  # keep going: one bad sentence shouldn't stop the rest
            print('FAILED', p['text'], e)
            failed.append(p['text'])
            continue
    done.append(p['key'])
json.dump(sorted(done), open('voice/manifest.json', 'w'))
print(f'recorded {len(done)} of {len(phrases)} phrases; failed {len(failed)}')
