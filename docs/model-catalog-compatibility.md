# Modellkatalógus és korábbi konfigurációk

Az új modellválasztás és ajánlás a Claude Opus/Sonnet/Haiku 5.5 vonalát kínálja. Ez nem migráció: a `DISTRIBUTION_DEFAULT_AGENT_MODEL`, az install konfigurációból származó `DEFAULT_AGENT_MODEL`, a már mentett agentmodellek és az OpenRouter AUTO feloldása változatlan.

## Aliasok

- `resolveModelId` a mentett konfigurációk és a profilok kompatibilitási feloldója. A korábbi `opus`, `sonnet`, `haiku` aliasok eredeti modellje marad.
- `resolveSelectedModelId` az új agent létrehozásának explicit választását oldja fel. `opus` → `claude-opus-5-5[1m]`, `sonnet` → `claude-sonnet-5-5`, `haiku` → `claude-haiku-5-5`.
- A teljes modellazonosító és a verziót név szerint rögzítő korábbi alias változatlanul megy át. Az `inherit` továbbra is az install tényleges alapmodelljét jelenti.
- Az agent szerkesztése és az alacsonyabb szintű `writeAgentModel` a megadott értéket tárolja. Korábbi érték visszamentése nem értelmezhető automatikus modellváltásként.

## Beállítás és dashboard

A `DEFAULT_AGENT_MODEL.valueSet` az új opciókat, a `legacyValueSet` a már használt korábbi modellazonosítókat tartalmazza. A validáció mindkettőt elfogadja. A dashboard a listán kívüli aktuális értéket „korábbi beállítás” jelöléssel hozzáadja a beállítás szerkesztőjéhez. Az agent szerkesztő dinamikus opciója ugyanígy megőrzi a mentett modellt. A mentett modell kiválasztása szinkron történik, a két aszinkron lista indítása előtt. A későbbi katalógus- és Ollama-frissítés a válasz beérkezésekor aktuális UI-választást olvassa, a hiányzó opciót dinamikusan pótolja, majd visszaállítja a kiválasztást. Így a régi Claude/DeepSeek/OpenRouter vagy egyedi ID megmarad, és a még nem mentett explicit új választást sem írja felül a korábbi szerverkonfiguráció.

A Claude agentválasztó tényleges forrása a `web/index.html` két statikus listája. A `/api/models/available` Claude-listája ezzel egyezik; a CLI-kapu megmarad. A Haiku 5.5 CLI-támogatását ez a munka élő modellhívással nem ellenőrizte.

A közvetlen DeepSeek választó az új Flash-választáshoz `deepseek-flash` route-ot ad. A korábbi mentett `deepseek-v4-flash` nem íródik át.

## OpenRouter: explicit legacy, változatlan runtime

A [nyilvános OpenRouter metaadatlistán](https://openrouter.ai/api/v1/models) 2026-10-10-én 458 modell volt; három fallback-katalógusbeli route nem szerepelt benne:

- `meta-llama/llama-3.3-70b-instruct:free`
- `qwen/qwen3-coder:free`
- `google/gemini-3.1-pro`

A listából hiányzás nem bizonyított 404. Az `openRouterModelWarning` ezeket „Legacy: nem ajánlott” jelöléssel adja a dashboardnak. Az érintett AUTO-opció és a kurált kézi opció új választáskor tiltott; a már kiválasztott legacy érték látható és visszamenthető marad. Az API a tier `autoWarning`, `manualWarnings` mezőiben, illetve a kurált modell `warning` mezőjében közli az indokot.

A fallback-katalógus konkrét ID-i és a `resolveOpenRouterModel` változatlanok. Így a már mentett `openrouter-auto:tier0` nem vált modellt csendben, és az ingyenes route helyére nem kerül fizetős. A runtime-katalógus későbbi frissítése külön, explicit üzemeltetői döntés.

## Rembrandt

A kézzel indítható review script kompatibilitási kulcsai: `sol` → `gpt-6.1-sol`, `terra` → `gpt-6-sol`, `luna` → `gpt-6-luna`. A `terra` kulcs és az alapértelmezett kulcs neve megmaradt. A scriptet valódi Codex/LLM sessionnel nem próbáltuk; az offline teszt csak a modellválasztó `case` ágat futtatja.

## Ellenőrzés

A `model-catalog-cleanup.test.ts` a mentett modellek olvasását/visszamentését, az új ajánlásokat, a változatlan alapokat, az OpenRouter free feloldást, a dashboard legacy-kapuját és a Rembrandt modelltérképét ellenőrzi. A `picker-cli-gate.test.ts` a `/api/models/available` válaszát mockolt vaulttal vizsgálja, élő modellhívás nélkül.

A Haiku 5.5 inputár-becslés az [Anthropic modelláttekintőjének](https://platform.claude.com/docs/en/models/overview) 2026-10-10-i alapárára épül. A hosszú kontextus felára, cache és előfizetés nincs ebben a durva becslésben.
