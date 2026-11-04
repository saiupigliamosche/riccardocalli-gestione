# Deploy backend amministrativo e area iscritti

Il frontend PWA è già predisposto a collegarsi a un endpoint Apps Script esterno.

## 1. Crea un progetto Apps Script
Apri Google Apps Script con l'account `riccardo.calli@gmail.com`.

Crea un nuovo progetto, ad esempio:
`Parkour Course OS Admin Backend`

## 2. Copia il backend
Copia integralmente nello stesso progetto Apps Script:
- `backend/Code.gs` nel file `Code.gs`;
- `backend/JotformWebhook.gs` in un secondo file script chiamato `JotformWebhook.gs`.
- `backend/MemberPortal.gs` in un terzo file script chiamato `MemberPortal.gs`.
- `backend/Shirts.gs` in un quarto file script chiamato `Shirts.gs`.

I quattro file lavorano nello stesso progetto e sullo stesso Google Sheet. `MemberPortal.gs` gestisce accessi via email, scadenze, documenti e conferme lezione senza creare un backend o un database parallelo.

## 3. Imposta il token amministratore
In Apps Script:
Project Settings → Script Properties

Crea:
- Property: `ADMIN_TOKEN`
- Value: una stringa lunga e casuale, non riutilizzata altrove.

Non inserire questo token nel repository GitHub.

## 4. Imposta il segreto webhook Jotform
In Apps Script → Project Settings → Script Properties crea anche:
- Property: `JOTFORM_WEBHOOK_SECRET`
- Value: una seconda stringa lunga e casuale, diversa da `ADMIN_TOKEN`.

Non inserirla nel repository.

## 5. Configura Firebase Cloud Messaging
In Apps Script → Project Settings → Script Properties aggiungi:
- `FCM_PROJECT_ID`;
- `FCM_CLIENT_EMAIL`;
- `FCM_PRIVATE_KEY`;
- `FCM_VAPID_PUBLIC_KEY`;
- `FCM_WEB_CONFIG`, contenente il JSON pubblico dell'app web Firebase.

La chiave privata Firebase deve restare esclusivamente nelle proprietà protette di Apps Script.

## 6. Autorizzazioni necessarie
La nuova area usa i servizi Apps Script per:
- inviare email con link personali permanenti e promemoria;
- registrare i dispositivi e inviare notifiche push tramite Firebase Cloud Messaging;
- salvare in Google Drive i documenti caricati dall'amministratore;
- creare il trigger orario delle automazioni.

Alla prima distribuzione Google chiederà di autorizzare questi permessi. La cartella Drive `Parkour Course OS - Documenti iscritti` viene creata automaticamente e resta privata.

## 7. Distribuisci come Web App
Deploy → New deployment → Web app

Impostazioni:
- Execute as: Me
- Access: solo l'account appropriato se disponibile; in alternativa usare il token applicativo previsto dal backend.
- Copia l'URL `.../exec`.

## 8. Collega Jotform al webhook
Nel Form Builder Jotform del modulo `262643062831050`:
Settings → Integrations → Webhooks.

Inserisci come endpoint:
`<URL_WEB_APP_EXEC>?jf_secret=<JOTFORM_WEBHOOK_SECRET>`

Completa l'integrazione.

## 9. Collega la PWA dal telefono
Apri la PWA gestionale.
Premi `COLLEGA BACKEND`.

Inserisci:
1. URL Web App Apps Script
2. ADMIN_TOKEN

I due valori vengono salvati solo nel localStorage del dispositivo.

## 9. Attiva le automazioni
Nel gestionale apri `Dashboard` → `Area iscritti` e premi `ATTIVA AUTOMAZIONI` una sola volta.

Il controllo orario invia:
- richiesta di conferma alle 09:00 nei giorni di corso;
- promemoria alle 16:00 solo a chi non ha risposto;
- promemoria pagamenti 7 giorni prima, il giorno della scadenza e dopo 3 giorni di ritardo.

## 10. Test minimo
Verificare:
- aprire l'URL Web App in GET e verificare `ok: true`;
- inviare una submission Jotform di test e verificare che compaia una sola volta in `Moduli iscrizione` e una sola volta in `Iscritti`;
- ripetere lo stesso webhook/submission ID e verificare che non vengano creati duplicati;
- caricamento Dashboard;
- elenco Iscritti;
- elenco Prove;
- registrazione di una presenza test;
- registrazione di un pagamento test;
- richiesta link personale permanente dall'area iscritti;
- risposta Sì/No a una lezione e verifica nel gestionale;
- modifica manuale di una scadenza;
- caricamento e download di un PDF di prova;
- rimozione dei dati test dal Course OS.

## Sicurezza
Il repository è pubblico, quindi:
- nessun token;
- nessun dato personale;
- nessuna credenziale;
devono essere committati nel codice.

## Aggiornamento maglie sul deployment esistente

1. Nel progetto Apps Script già collegato aggiorna Code.gs e aggiungi Shirts.gs. Mantieni la configurazione e le autorizzazioni esistenti.
2. Crea una nuova versione sul deployment esistente, mantenendo il suo URL. Verifica la risposta GET con versione 1.14.0.
3. In Dashboard → Ordini maglie il listino iniziale usa le rilevazioni TeeFarm fornite da Saiu (1, 5, 7, 8, 10 e 25 pezzi). Le altre quantità fino a 25 usano una stima dalla rilevazione precedente. Da 26 pezzi appare “Prezzo in verifica”. Puoi sostituire il listino dal pannello admin. La vista Per persona raggruppa i preordini aperti e lo storico dei lotti.
4. I quattro mockup approvati sono inclusi in iscritti/maglie/ come salto.webp, fronte.webp, retro.webp e gruppo.webp. Verifica la galleria con un account iscritto.
5. Collauda su una copia del database con due sessioni. Salva un preordine per ciascuna e verifica il ricalcolo per entrambe. Chiudi il lotto dall’admin e controlla che il nuovo parta a zero e lo storico rimanga disponibile.
6. Pubblica il frontend solo dopo che il backend risponde alle nuove azioni. L’acquisto si finalizza su TeeFarm e si registra successivamente nel gestionale.

Le schede Preordini maglie e Lotti maglie vengono create alla prima scrittura. Il listino resta modificabile dal pannello admin.
