# Riccardo Calli — Gestione Corso

PWA mobile-first per la gestione del corso Parkour 2026/27.

## Architettura
- Gestionale amministrativo statico pubblicato con GitHub Pages.
- Area iscritti PWA in `/iscritti/`, con accesso tramite link email monouso.
- Un solo backend Google Apps Script autenticato.
- Un solo database: Google Sheet "Parkour Course OS 2026-2027".
- Documenti privati in Google Drive, restituiti solo dopo autenticazione.
- Nessun dato personale o segreto nel repository.

## Gestionale
- Home e presenze
- Prove
- Iscritti
- Pagamenti
- Didattica
- Dashboard

## Area iscritti
- conferma Sì/No per la prossima lezione prevista dal piano;
- scadenze e storico pagamenti;
- documenti firmati e fatture caricati dall'amministratore;
- profilo e disconnessione del dispositivo.

Le email automatiche per lezioni e pagamenti vengono gestite dal trigger orario Apps Script descritto in `backend/DEPLOY.md`.
