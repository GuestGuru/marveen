---
name: telegram-hang-atirat
description: Telegram (vagy Discord) hangüzenet átírása szövegre, ha a csatorna NEM adott automatikus átiratot. Triggerelődik - inbound channel blokk attachment_kind="voice" vagy audio/ogg mimetype, "(voice message)" tartalom, hiányzó [Hang átirat] prefix.
---
# Hangüzenet átírás (lokális whisper)

## Mikor használd

Bejövő channel üzenet hangfájllal, ÉS nincs mellette átirat. Így ismered fel:
- `attachment_kind="voice"`, `attachment_mime="audio/ogg"`, a body pedig csak `(voice message)`
- nincs `[Hang átirat]:` prefix

Ha VAN `[Hang átirat]:` prefix, ne csinálj semmit ezzel a skillel, az már kész szöveg.

## Eljárás

1. Töltsd le: `download_attachment(file_id=<attachment_file_id>)`. Visszaad egy `.oga` útvonalat a `~/.claude/channels/telegram/inbox/` alatt.
2. Írasd át (a gépen `whisper` van pipax-ból, `~/.local/bin/whisper`, és `ffmpeg` is elérhető):
   ```bash
   cd <scratchpad> && timeout 480 whisper <FAJL.oga> \
     --model base --language hu --task transcribe \
     --output_format txt --output_dir . --fp16 False
   ```
   A konzolra `[00:00.000 --> 00:03.000]  szöveg` formában kiírja, tehát a .txt-t nem is kell visszaolvasni rövid üzenetnél.
3. A kapott szöveget kezeld úgy, mint egy sima szöveges utasítást, és hajtsd végre.
4. A válaszban idézd vissza, mit értettél ("Amit mondtál: ..."), hogy felismerési hiba esetén tudjon javítani.

## Buktatók

- **`--fp16 False` kell**, CPU-n az fp16 warningot dob és lassít.
- **`--language hu` mindig explicit.** Rövid felvételnél a nyelvfelismerés félrenyúl, és angolként próbálja átírni a magyart.
- A `base` modell első futáskor letölt 139 MB-ot a `~/.cache/whisper`-be. Ez egyszeri, utána azonnal indul. Ne ijedj meg a progress bartól.
- Hosszabb vagy zajos felvételnél `--model small` vagy `medium` pontosabb, de CPU-n érezhetően lassabb.
- **A `base` magyarra megbízhatatlan, még rövid üzenetnél is.** 2026-08-14, egy 30
  másodperces üzenet: a `base` ezt adta, hogy „terjunk vissza a vanpégyára... tegy
  élőszek kérlek, ilyen megkeresési émel szempelt", a `small` ugyanarra a fájlra ezt:
  „térjünk vissza a vanpeidzsárra... tegyél kérlek ilyen megkeresési e-mail
  szempelt". A második érthető, az első nem. **Kezdd a `small`-lal**, a `base` csak
  akkor jó, ha a `small` valamiért nem elérhető. A modell-letöltés egyszeri
  (`small` 461 MB), utána gyors.
- **A whisper hallucinál a felvétel végi csendre.** Ugyanebben a példában a záró
  szegmens egy odanemvaló „Sziasztok!" lett. Az utolsó egy-két szót ne vedd
  készpénznek, főleg ha nem illik a mondatba.
- **Az idegen szavakat fonetikusan írja le.** A „vanpeidzsár" a „one-pager", a
  „szempelt" a „sablont". Mielőtt visszakérdezel, olvasd hangosan a gyanús szót,
  és nézd meg, van-e a munkakörnyezetben ilyen hangzású szakszó.
- A `whisper` python modul a pipx venvben van, a rendszer python3-ból `import whisper` NEM működik. Csak a CLI-t használd.
- Ne a `/tmp`-be dolgozz, hanem a session scratchpadjába, mert a whisper `.txt`/`.json` melléktermékeket ír a `--output_dir`-be.

## Ellenőrzés

- A kimeneten van értelmes magyar mondat, nem angol halandzsa (ha igen: rossz nyelv-flag).
- A válaszodban szerepel az átirat, hogy a gazda látja, mit hallottál.
