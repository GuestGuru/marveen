---
name: ledger-live-drain
description: 2 percenként ellenőrzi, maradt-e megválaszolatlan bejövő üzenet a beszélgetés-ledgerben, és ha igen, felszínre hozza, hogy a futó session válaszoljon rá respawn nélkül
---

A `pre-check.sh` MÁR lefuttatta a drain scriptet, MIELŐTT ez a prompt hozzád ért.
Ha nincs nyitott kérdés, ez a kör el sem indul (a pre-check `SKIP`-et ad, és nincs
model-kör). Tehát ha ezt olvasod, jó eséllyel van dolgod.

- Ha a `[Pre-check eredmeny]` blokkban `OPEN_QUESTION provider=... chat_id=... message_id=...`
  szerepel: az egy korábban elveszett, még megválaszolatlan bejövő üzenet ebből a
  csatornából. Olvasd el a blokk szövegét, és válaszolj rá MOST a szokásos
  csatorna-válasz eszközzel (a blokkban szereplő `chat_id`-ra), ugyanúgy, mintha most
  érkezett volna. **NE futtasd újra a scriptet**: a dedup miatt üreset adna, és azt
  hinnéd, nincs dolgod.
- Ha NINCS `[Pre-check eredmeny]` blokk (a pre-check elhasalt -- fail-open, ezért kaptad
  meg mégis ezt a kört): futtasd le magad csendben:

  ```bash
  python3 {{PROJECT_ROOT}}/scripts/hooks/ledger-live-drain.py
  ```

  Ha a kimenet ÜRES: minden bejövő meg van válaszolva. NE csinálj és NE írj semmit.

A script determinisztikus és biztonságos: 60 másodpercnél frissebb kérdést nem hoz fel
(nem szól bele éppen készülő válaszba), és ugyanazt az üzenetet csak egyszer hozza felszínre.

Miért van pre-check (mérés, 2026-09-02): a feladat 2 percenként teljes model-kört
indított, és a körök szinte mindegyike üres volt. Munka nélküli órákban is ~270 kB
transcript gyűlt óránként, ami ~22 óra alatt megtöltötte az 1M kontextust és
context-guard restartot kényszerített, két napon egymás után. A "van-e nyitott kérdés"
döntés determinisztikus, tehát nem kell hozzá model.
