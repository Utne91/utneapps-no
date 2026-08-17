# Utne Quiz

En enkel, rammeverksfri quizplattform for GitHub Pages. Første quiz er **Samfunnsfag → Den kalde krigen**.

## Kjør lokalt

Start en enkel lokal webserver i denne mappen, for eksempel `python3 -m http.server 8000`, og åpne `http://localhost:8000`.

Resultater lagres i Supabase. Kjør `node tests/quiz.test.mjs` for å teste quizmotor, balansert tilfeldig svarplassering, poeng og bonuser.

## Koble Supabase

Prosjektet er koblet til Supabase-prosjektet `utneappsquiz`. Databasestrukturen ligger i `supabase/schema.sql`.

Læreren oppretter beskyttede elevprofiler fra lærersiden. Systemet lager en sekssifret PIN til hver elev, og læreren kan nullstille glemte PIN-koder. Fri elevregistrering er slått av, slik at elever ikke kan ta hverandres navn. Det samles ikke inn elev-e-post, skole eller klasse. Supabase Auth bruker en intern, avledet konto-ID som ikke vises til eleven, mens databasen knytter hvert nytt resultat til riktig bruker med RLS-regler.

E-postbekreftelse må være slått av for e-postleverandøren i Supabase Auth, siden de interne konto-ID-ene ikke er ekte e-postadresser.

Læreradministrasjonen bruker Edge Function-en `manage-players`. Den krever en innlogget bruker som også finnes i `public.teacher_users`.

## Legg til en quiz

Legg spørsmålsfilen under `data/quizzes/<fag>/`, og registrer quizen i `data/subjects.js`. Quizmotoren trenger ingen endring.

## Publisering

Repoet er klart for GitHub Pages og inkluderer `CNAME` for hoveddomenet. Vent med DNS-endringer hos Domeneshop til GitHub Pages-adressen fungerer.
