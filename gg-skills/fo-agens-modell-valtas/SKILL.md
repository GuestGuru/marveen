---
name: fo-agens-modell-valtas
description: A fő-ágens (MAIN_AGENT_ID) LLM-modelljének tartós megváltoztatása a Marveen forkban. Triggerelődik - "miért váltottál vissza X-re", "a dashboard nem engedi átírni a modellt", modell visszaáll deploy/update.sh után, opus-5 vs opus-4-8[1m] választás, két fő-ágens fut egyszerre.
---

# Fő-ágens modell-váltás (Marveen fork)

## Mikor használd
- A fő-ágens (én, MAIN_AGENT_ID) modellje váratlanul visszaállt egy `update.sh`/deploy után.
- Tamás a dashboardon átírta a fő-ágens modelljét, de "nem enged" / nincs hatása.
- Modell-váltást kérnek (pl. opus-4-8[1m] -> opus-5) és tartósan kell.

## A csapda (miért nem működik a dashboard)
- A dashboard a fő-ágens modelljét ide írja: `PROJECT_ROOT/agent-config.json` (`writeAgentModel`, mert `agentDir(MAIN)=PROJECT_ROOT`).
- DE az indító `scripts/channels.sh` a modellt MÁSHONNAN olvassa, ebben a sorrendben (`resolve_main_model`):
  1. `.env` -> `MAIN_AGENT_MODEL=` (elsőbbség, gitignored)
  2. `.claude/settings.json` -> `.model`
- Tehát az `agent-config.json`-t a launcher SOSEM nézi -> a dashboardos váltásnak igazi újraindításnál nincs hatása.
- A `.claude/settings.json` git-TRACKELT (committált: `claude-opus-4-8[1m]`). Egy `update.sh` git checkout/pull után visszaáll erre, ÉS egy kézi settings.json-diff blokkolja a jövőbeli update-et.

## Eljárás
1. Állapotfelmérés:
   ```bash
   cd /home/gg/marveen
   bash scripts/channels.sh --resolve-main-model      # mit fog indítani a launcher
   grep -E '^MAIN_AGENT_MODEL=' .env || echo "(nincs .env override)"
   python3 -c "import json;print(json.load(open('.claude/settings.json'))['model'])"
   ps aux | grep -E "claude .*--channels" | grep -v grep   # hány fő-ágens fut ÉS milyen modellen
   ```
2. Tartós beállítás (a HELYES hely a gitignored `.env`, NEM a settings.json):
   ```bash
   # ha van már MAIN_AGENT_MODEL sor, cseréld; ha nincs, fűzd hozzá
   grep -q '^MAIN_AGENT_MODEL=' .env \
     && sed -i 's|^MAIN_AGENT_MODEL=.*|MAIN_AGENT_MODEL=<MODELL>|' .env \
     || printf '\nMAIN_AGENT_MODEL=%s\n' '<MODELL>' >> .env
   bash scripts/channels.sh --resolve-main-model      # verifikáld: <MODELL>-t ír
   ```
3. Duplikátum-takarítás: ha több `--channels` fő-ágens fut (tmux-cikluson kívül indult régi példány maradhat egy dashboard-relaunch után), a régit ki kell lőni, hogy ne legyen dupla inbound.
4. Tiszta újraindítás a választott modellel (ez ENGEM is újraindít; a ledger visszahozza a beszélgetést). Preferáld a rendes életciklust (`update.sh` / channels restart), ne kézi ad-hoc launchot, hogy ne keletkezzen újabb árva példány.

## Buktatók
- **1M context tradeoff:** a fő-ágens a `claude-opus-4-8[1m]` variánson fut, az `[1m]` = 1M-es context ablak, amit a beszélgetés-ledger tényleg használ. A sima `claude-opus-5` (amin pl. SalesNinja megy) [1m] NÉLKÜLI -> kisebb ablak. Modell-váltásnál MINDIG jelezd ezt a tradeoffot és kérj döntést (opus-5 / opus-5[1m] ha támogatott / marad 4.8[1m]), ne váltsd némán.
- **SOHA ne a settings.json-t írd** a modellhez: trackelt fájl, git-revert + update-blokk. Csak `.env`.
- **Két fő-ágens:** az `update.sh` nem feltétlen lövi ki a normál tmux-életcikluson KÍVÜL (pl. dashboard "relaunch with model") indult fő-ágenst -> két `--channels telegram` fő-ágens marad, flaky inbound. Ellenőrizd a `ps`-sel és takaríts.
- **NEM minden `--channels` processz duplikátum:** a flotta többi ágense (SalesNinja stb.) is `--channels plugin:telegram`-mal fut, saját bot-tokennel. Kilövés ELŐTT kötelező a tmux-session szerinti azonosítás, különben más ágens csatornáját némítod:
  ```bash
  tmux list-panes -a -F '#{session_name} #{pane_pid}'   # a fő-ágens: marveen-channels
  ```
  Csak a `marveen-channels` sessionön kívüli, gazdátlan `--channels` példány a takarítandó.
  Gyorsabb azonosítás tmux nélkül a `/proc/<pid>/cwd`-ből: a marveen fő-ágens cwd-je `/home/gg/marveen`, a SalesNinjáé `/home/gg/marveen/agents/salesninja`. Ha a cwd más ágens-mappa, NE lődd ki.
- **Eltérő `--model` string a két processzen NEM anomália.** 2026-08-07: pánikszerűen "duplikált fő-ágenst" mentettem memóriába, mert két `--channels` futott `claude-opus-5[1m]` ill. `claude-opus-5` modellel. Valójában a marveen main (`[1m]`) és a SalesNinja (`[1m]` nélkül) külön konfigja volt -- a cwd egyértelműsítette. TANULSÁG: mielőtt "duplikátumot" vagy anomáliát jelentesz, ellenőrizd a `/proc/<pid>/cwd`-t; a modell-string önmagában NEM azonosít. Két külön cwd = két külön ágens, akkor is, ha a modell eltér.
- **`claude-opus-5[1m]` TÁMOGATOTT** (verifikálva 2026-08-02: a fő-ágens ezen fut, a system prompt "Opus 5 (1M context)"-et jelez). Tehát a "opus-5 vagy 1M ablak" nem valódi tradeoff, a `[1m]` variánst kell kérni.
- **chat_id 0:** friss restart után a `reply` tool `chat_id: 0` shorthand elhasalhat ("chat 0 is not allowlisted"); ilyenkor a valódi ID a `~/.claude/channels/telegram/access.json` `allowFrom[0]`.
- **A channels-recovery hard-restart MEGKERÜLI a `.env`-et.** 2026-08-03: a `[SYSTEM: channels recovery]` hard restart `--continue --model claude-opus-4-8[1m]`-mel indított újra (a git-trackelt `settings.json` értékével), NEM a `channels.sh` `resolve_main_model` útján. Így a fő-ágens visszaesett 4.8[1m]-re, pedig a `.env` MAIN_AGENT_MODEL=claude-opus-5[1m] helyes volt és a launcher is azt oldotta fel. Diagnózis: hasonlítsd a futó `ps ... --channels --model`-t a `--resolve-main-model` kimenetéhez; ha eltér, a recovery-út a hibás, nem a config. Javítás: tiszta újraindítás a rendes úton (nem `--continue` ad-hoc launch). A tartós fix a recovery-script `.env`-tiszteletben tartása -- kártyára veendő, ne néma.
- **A visszaesés ISMÉTLŐDIK és NÉMA.** 2026-07-31 / 08-04 / 08-05 / 08-06 / 08-07 (ötödik+hatodik eset): minden plugin-lekapcsolódás után ugyanez történt, és két napig észrevétlen maradt, mert a recovery csendben, `--continue`-val dolgozik -- a beszélgetés folytatódik, semmi nem jelzi a modellváltást. Amíg a recovery-script nincs javítva, a futó modellt RENDSZERESEN mérd (napindító / heartbeat első lépéseként), ne csak restart után:
  ```bash
  ps -eo pid,lstart,args | grep -- '--channels' | grep -v grep   # a saját cwd-d a /proc/<pid>/cwd
  ```
  Az egyezést a `.env` MAIN_AGENT_MODEL-lel vesd össze; eltérésnél tiszta restart (nem `--continue`).

## Ellenőrzés
- `bash scripts/channels.sh --resolve-main-model` a kívánt modellt írja.
- `ps aux | grep -- '--channels'` PONTOSAN egy fő-ágenst mutat, a kívánt `--model`-lel.
- Egy `update.sh` NEM állítja vissza (mert `.env`-ből jön, nem a trackelt settings.json-ból).
