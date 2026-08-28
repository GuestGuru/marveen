---
name: armaradas-riasztas
description: Ármaradás-riasztás (4-es feladat) - melyik lakásunk ADR-je marad el a saját comp setjétől, mennyivel, és mikor állítottuk utoljára az árát. Triggerelődik - "futtasd a 4-est", "ármaradás", "hol maradtunk le árban", "elmaradt bevétel", "comp set összehasonlítás", heti árazási kör.
---

# Ármaradás-riasztás

## Mikor használd

Áron kéri a 4-es feladatot, vagy heti körben árazási elmaradást keresel.
Kimenet: lakásonként rés (EUR és %), comp set mintamérettel, occupancy kereszt-jel,
bázisár utolsó állítása, becsült elmaradt bevétel.

## Eljárás

### 1. Hozzáférés

A gg-mcp kulcsokat a proxy adja a gyerek-processz env-jébe, a beszélgetésbe soha:

```bash
GG_MCP_TOKEN_FILE=/home/gg/gg-mcp/tokens/marlenka.token \
GG_MCP_AGENT_LABEL=marveen/marlenka \
GG_MCP_UPSTREAM_URL=http://127.0.0.1:3450 \
gg-mcp-proxy exec --alias bpdb --env-var CONN -- sh -c "psql \"\$CONN\" -A -F'|' -f QUERY.sql"
```

Aliasok: `bpdb` (piaci adat), `gg3` (éles GG3 DB, read-only).
Ha csak `gg_login` látszik a tool-listában, nincs token -> `gg_login`, a kódot
add oda Áronnak (10 percig él).

### 2. A mi oldalunk (GG3)

```sql
-- realizált ADR + occupancy: a BPDB gg3_adr táblájából (LTM ablak!)
-- bázisár utolsó állítása:
SELECT u.id, u.name, a.name, r.price, r.min_price, r.updated_at
FROM units u JOIN accommodations a ON a.id=u.accommodation_id
JOIN rates r ON r.unit_id=u.id
WHERE a.termination IS NULL;
```

### 3. Comp set (BPDB / AirDNA)

```sql
SELECT l.platform_id, a.district, a.submarket_name, a.accommodates,
       a.average_daily_rate_ltm AS adr, a.occupancy_rate_ltm AS occ
FROM airdna_listings_current a
JOIN listings l ON l.platform='airbnb' AND l.platform_id=a.airbnb_property_id AND l.is_open
WHERE a.district IS NOT NULL AND a.average_daily_rate_ltm IS NOT NULL;
```

Comp set = azonos kerület + kapacitás-sáv (1-2 / 3-4 / 5-6 / 7+), a GG saját
listingjei kizárva (`operator_active_listings WHERE operator_id=13`), min. 10 elem.
Párosítás: `gg3_adr.airbnb_id = airdna_listings_current.airbnb_property_id`.

### 4. Értékelés

- rés = (comp set medián ADR - a mi ADR-ünk) / medián
- **kereszt-jel**: ha a mi occupancy-nk MAGASABB a comp seténél -> alulárazás.
  Ha alacsonyabb -> nem ár-probléma, ne riassz, nézd meg külön.
- elmaradás becslés = rés x 90 nap x saját occupancy. **Felső korlát**, mondd ki.

Kész szkript: `scratchpad/analyze2.py` mintája (2026-08-12).

## Buktatók

- **A hirdetett forward árat NE használd elmozdulás-mérésre.** A BPDB
  `booking_calendar_forward`-ban csak két snapshot van (2026-06-05, 2026-08-01),
  és a 30/60/90 napos ablak közben elmozdul. A különbség szezonalitást mér, nem
  árváltozást. 2026-08-12-én minden comp setben -3..-18% "esés" jött ki: artefakt.
- **A GG3 napi ára nem az OTA-ár.** A `rate_date_sync.price` nettó bázis; az OTA-n
  channel modifier + takarítás + IFA + ÁFA után jelenik meg. Naiv összevetésből
  60-83%-os hamis rés jött ki. Ezért megy az összehasonlítás realizált ADR-en.
- **`is_hidden` nem kivezetés.** 19 lakás `is_hidden=true`, mégis 2027-ig árazva.
  Csak `termination IS NULL`-ra szűrj.
- **Az árak fillérben/centben vannak** a GG3-ban (`price/100`).
- **Kapacitás-eltérés**: az AirDNA `accommodates` és a GG3 `occ_adults` eltérhet
  (Ráday18: 7 vs 6). Ilyenkor rossz comp setbe eshet, mindig ellenőrizd a top
  tételeknél, és jelezd Áronnak.
- **LTM-ablakok nem azonosak**: `gg3_adr` 2025-03-18..2026-03-18, az AirDNA
  frissebb. Említsd meg a jelentésben.

## Ellenőrzés

Mielőtt küldöd:
- [ ] a top 10-nél a kapacitás egyezik-e (AirDNA vs GG3)
- [ ] minden comp set n >= 10, a mintaméret benne van a jelentésben
- [ ] minden számhoz forrás + lehúzási időpont + a vonatkozó periódus
- [ ] a becslés becslésként van jelölve, a módszerrel együtt
- [ ] az occupancy kereszt-jel megnézve (a res + alacsony occ NEM ármaradás)
- [ ] soha nem állítasz árat, csak jelzel
