#!/usr/bin/env python3
"""Text to speech for the demo video: one WAV per scene with Azure AI Speech (neural voice), keyless.

Auth: Microsoft Entra ID (the workflow signs in with OIDC; AzureCliCredential picks the token up) against the
Speech resource's custom domain. Writes docs/video/build/<id>.wav and timings.json (sentence cues for captions).
"""
import json, os, re, sys, html
import azure.cognitiveservices.speech as speechsdk
from azure.identity import AzureCliCredential

ENDPOINT = os.environ["SPEECH_ENDPOINT"]          # https://<custom-domain>.cognitiveservices.azure.com/
VOICE = os.environ.get("SPEECH_VOICE", "en-US-AndrewMultilingualNeural")
SCENES = json.load(open("docs/video/scenes.json"))["scenes"]
OUT = "docs/video/build"
os.makedirs(OUT, exist_ok=True)
cred = AzureCliCredential()
timings = {}
for sc in SCENES:
    text = " ".join(sc["narration"].split())
    cfg = speechsdk.SpeechConfig(token_credential=cred, endpoint=ENDPOINT)
    cfg.set_speech_synthesis_output_format(speechsdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm)
    path = f"{OUT}/{sc['id']}.wav"
    synth = speechsdk.SpeechSynthesizer(speech_config=cfg, audio_config=speechsdk.audio.AudioOutputConfig(filename=path))
    words = []
    synth.synthesis_word_boundary.connect(lambda e: words.append((e.audio_offset / 1e7, e.text_offset, e.word_length)))
    ssml = (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">'
            f'<voice name="{VOICE}"><prosody rate="-4%">{html.escape(text)}</prosody></voice></speak>')
    res = synth.speak_ssml_async(ssml).get()
    if res.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
        det = res.cancellation_details
        sys.exit(f"TTS failed for {sc['id']}: {res.reason} {getattr(det, 'error_details', '')}")
    dur = res.audio_duration.total_seconds()
    # sentence cues: start time of the first word of each sentence (text offsets are relative to the SSML)
    base = ssml.index(html.escape(text))
    sentences, cues, pos = re.split(r"(?<=[.!?])\s+", text), [], 0
    for s in sentences:
        start_char = text.index(s, pos); pos = start_char + len(s)
        t = next((w[0] for w in words if w[1] - base >= start_char), None)
        cues.append({"start": t if t is not None else 0.0, "text": s})
    for i, c in enumerate(cues):
        c["end"] = cues[i + 1]["start"] if i + 1 < len(cues) else dur
    timings[sc["id"]] = {"duration": dur, "cues": cues}
    print(f"{sc['id']}: {dur:5.1f}s  {len(text.split())} words")
json.dump(timings, open(f"{OUT}/timings.json", "w"), indent=1)
print("total", round(sum(t["duration"] for t in timings.values()), 1), "s")
