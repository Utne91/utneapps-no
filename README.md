# Utne Quiz

En enkel, rammeverksfri quizplattform for GitHub Pages. Plattformen har quizer i samfunnsfag og naturfag.

## Kjør lokalt

Start en enkel lokal webserver i denne mappen, for eksempel `python3 -m http.server 8000`, og åpne `http://localhost:8000`.

Resultater lagres i Supabase. Kjør `node tests/quiz.test.mjs` for å teste quizmotor, balansert tilfeldig svarplassering, poeng og bonuser.

## Koble Supabase

Prosjektet er koblet til Supabase-prosjektet `utneappsquiz`. Databasestrukturen ligger i `supabase/schema.sql`.

Læreren oppretter beskyttede elevprofiler fra lærersiden. Systemet lager en sekssifret PIN til hver elev, og læreren kan nullstille glemte PIN-koder. Fri elevregistrering er slått av, slik at elever ikke kan ta hverandres navn. Læreren kan velge en elev og se antall runder, samlet treffprosent, beste poengsum, siste aktivitet og historikken for hver runde. Det samles ikke inn elev-e-post, skole eller klasse. Supabase Auth bruker en intern, avledet konto-ID som ikke vises til eleven, mens databasen knytter hvert nytt resultat til riktig bruker med RLS-regler.

Læreren kan også lage faggrupper, legge samme elev i flere grupper og kopiere medlemslisten fra en eksisterende gruppe når en ny gruppe opprettes. Elevnavn kan limes rett inn når gruppen lages; manglende kontoer og PIN-koder opprettes automatisk, mens eksisterende elever bare legges til. Grupper og enkeltelever kan slettes etter en tydelig bekreftelse. Sletting av en elev fjerner kontoen, gruppemedlemskapene og elevens quizresultater.

E-postbekreftelse må være slått av for e-postleverandøren i Supabase Auth, siden de interne konto-ID-ene ikke er ekte e-postadresser.

Læreradministrasjonen bruker Edge Function-en `manage-players`. Den krever en innlogget bruker som også finnes i `public.teacher_users`.

## Legg til en quiz

Legg spørsmålsfilen under `data/quizzes/<fag>/`, og registrer quizen i `data/subjects.js`. Quizmotoren trenger ingen endring.

## Publisering

Repoet er klart for GitHub Pages og inkluderer `CNAME` for hoveddomenet. Vent med DNS-endringer hos Domeneshop til GitHub Pages-adressen fungerer.
