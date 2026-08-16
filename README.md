# Utne Quiz

En enkel, rammeverksfri quizplattform for GitHub Pages. Første quiz er **Samfunnsfag → Den kalde krigen**.

## Kjør lokalt

Start en enkel lokal webserver i denne mappen, for eksempel `python3 -m http.server 8000`, og åpne `http://localhost:8000`.

Resultater lagres i Supabase. Kjør `node tests/quiz.test.mjs` for å teste quizmotor, balansert tilfeldig svarplassering, poeng og bonuser.

## Koble Supabase

Prosjektet er koblet til Supabase-prosjektet `utneappsquiz`. Databasestrukturen ligger i `supabase/schema.sql`.

Navnene er selvvalgte fornavn/kallenavn. Ingen konto, e-post, skole eller klasse lagres.

## Legg til en quiz

Legg spørsmålsfilen under `data/quizzes/<fag>/`, og registrer quizen i `data/subjects.js`. Quizmotoren trenger ingen endring.

## Publisering

Repoet er klart for GitHub Pages og inkluderer `CNAME` for hoveddomenet. Vent med DNS-endringer hos Domeneshop til GitHub Pages-adressen fungerer.
