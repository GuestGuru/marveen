---
name: gg3-tulaj-lakas-lekerdezes
description: GG3 tulajdonos-lakás összerendelés és számla-lekérdezés SQL-lel, a gg3-olvasas kulccsal. Triggerelődik - "melyik lakás tulaja X", "kinek a lakása", "X tulaj lakásai", tulaj e-mail vagy adószám keresés, lejárt tulajdonosi számlák.
---

## Mikor használd

Anita bármit kérdez, ami a GG3 tulajdonos-, szállás-, lakás- vagy számla-adatához kell.
A `gg3_read` MCP tool NEM elég: az csak tizenegy árazási és naptár-táblát lát. SQL kell.

## Eljárás

1. **Identitás-ellenőrzés írás előtt** (olvasásnál is jó szokás): `gg_allowed_tools`,
   az `en` mező legyen `bezzeg.anita@guest.guru`. Ha nem az, ÁLLJ MEG.
2. Ha a `gg-access` toolokból csak a `gg_login` látszik, nincs párosítva a hozzáférés:
   hívd meg a `gg_login`-t, és add át Anitának SZÓ SZERINT a linket + kódot
   (emberi nyelven, ne technikai magyarázattal). A párosítás után a toolok maguktól
   megjelennek, a token-fájl `/home/gg/gg-mcp/tokens/brokermarcsi.token` néven jön létre.
3. Lekérdezés (a kulcs a gyerek-processz env-jébe megy, a beszélgetésbe soha):

```bash
GG_MCP_TOKEN_FILE=/home/gg/gg-mcp/tokens/brokermarcsi.token \
GG_MCP_AGENT_LABEL=marveen/brokermarcsi \
GG_MCP_UPSTREAM_URL=http://127.0.0.1:3450 \
gg-mcp-proxy exec --alias gg3 --env-var DATABASE_URL -- \
  sh -c 'psql "$DATABASE_URL" -P pager=off -c "SELECT ..."'
```

### Tulaj -> lakás

```sql
SELECT o.name AS tulaj, o.email, o.tax_id, o.city,
       a.name AS szallas, a.is_hidden, a.termination, u.name AS lakas
FROM owners o
JOIN accommodations a ON a.owner_id = o.id
LEFT JOIN units u ON u.accommodation_id = a.id
WHERE o.name ILIKE '%keresett_nev%'
ORDER BY a.name, u.name;
```

### Lejárt tulajdonosi számlák

`invoices.owner_id` a tulajdonosi számla, `is_paid = false` a nyitott, határidő =
kiállítás + 7 nap. Vendégszámlánál (`booking_id`) a határidő kiállítás + 8 nap, és
az `is_paid` MINDIG true, tehát ott nyitott tartozást keresni értelmetlen.

## Buktatók

- **`owners.accommodation_id` NEM létezik.** A wiki `gg3/gg3-database` doc tévesen így
  írja. A helyes irány fordított: `accommodations.owner_id -> owners.id`.
- **Ne joinolj `owners.group_id`-ra.** Az a GG cégcsoport azonosítója, nem a tulajé:
  minden szállást visszaad, több száz hamis sort.
- **`units`-on nincs `occupancy` oszlop** (a doc szerint lenne). Kétes mezőnél előbb:
  `SELECT column_name FROM information_schema.columns WHERE table_name='...'`.
- **A `$DATABASE_URL`-t a saját shelled kiüríti.** A `psql "$DATABASE_URL"` közvetlenül
  a `--` után NEM működik. A shellt bele kell tenni a láncba: `-- sh -c '...'`,
  egyszeres idézőjellel.
- **Idegen token-fájl TILOS.** Csak `brokermarcsi.token`.
- **Összegek fillérben.** Osztás 100-zal, mielőtt kimondod.
- **Hasonló nevek.** A `%somos%` keresés a "Somos András Sebestyén" mellett a
  "Somoskő Property Kft."-t is hozza. Ha több találat van, jelezd Anitának, hogy
  melyik melyik, ne válassz helyette.

## Ellenőrzés

- A találatok között van-e rejtett (`is_hidden = true`) vagy lezárt (`termination`
  kitöltve) szállás? Mondd meg külön, ne keverd az aktívak közé.
- Ha nulla sor jött, nézd meg kisebb mintával (`ILIKE '%vezeteknev%'`), mielőtt azt
  mondod, hogy nincs ilyen tulaj.
