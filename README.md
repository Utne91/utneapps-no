# Utne Quiz

En enkel, rammeverksfri quizplattform for GitHub Pages. Første quiz er **Samfunnsfag → Den kalde krigen**.

## Kjør lokalt

Start en enkel lokal webserver i denne mappen, for eksempel `python3 -m http.server 8000`, og åpne `http://localhost:8000`.

Uten Supabase lagres resultater lokalt i nettleseren. Kjør `node tests/quiz.test.mjs` for å teste quizmotor, stokking, poeng og bonuser.

## Koble Supabase

1. Opprett et Supabase-prosjekt.
2. Kjør `supabase/schema.sql` i SQL Editor.
3. Lim inn Project URL og den offentlige anon/publishable-nøkkelen i `js/config.js`.
4. Test lagring og highscore før publisering.

Navnene er selvvalgte fornavn/kallenavn. Ingen konto, e-post, skole eller klasse lagres.

## Legg til en quiz

Legg spørsmålsfilen under `data/quizzes/<fag>/`, og registrer quizen i `data/subjects.js`. Quizmotoren trenger ingen endring.

## Publisering

Repoet er klart for GitHub Pages og inkluderer `CNAME` for hoveddomenet. Vent med DNS-endringer hos Domeneshop til GitHub Pages-adressen fungerer.
