# Deploy backend amministrativo

Il frontend PWA è già predisposto a collegarsi a un endpoint Apps Script esterno.

## 1. Crea un progetto Apps Script
Apri Google Apps Script con l'account `riccardo.calli@gmail.com`.

Crea un nuovo progetto, ad esempio:
`Parkour Course OS Admin Backend`

## 2. Copia il backend
Copia integralmente nello stesso progetto Apps Script:
- `backend/Code.gs` nel file `Code.gs`;
- `backend/JotformWebhook.gs` in un secondo file script chiamato `JotformWebhook.gs`.

I due file lavorano nello stesso progetto: `Code.gs` continua a servire la PWA, mentre `JotformWebhook.gs` gestisce le submission Jotform senza creare un backend parallelo.

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

## 5. Distribuisci come Web App
Deploy → New deployment → Web app

Impostazioni:
- Execute as: Me
- Access: solo l'account appropriato se disponibile; in alternativa usare il token applicativo previsto dal backend.
- Copia l'URL `.../exec`.

## 6. Collega Jotform al webhook
Nel Form Builder Jotform del modulo `262643062831050`:
Settings → Integrations → Webhooks.

Inserisci come endpoint:
`<URL_WEB_APP_EXEC>?jf_secret=<JOTFORM_WEBHOOK_SECRET>`

Completa l'integrazione.

## 7. Collega la PWA dal telefono
Apri la PWA gestionale.
Premi `COLLEGA BACKEND`.

Inserisci:
1. URL Web App Apps Script
2. ADMIN_TOKEN

I due valori vengono salvati solo nel localStorage del dispositivo.

## 8. Test minimo
Verificare:
- aprire l'URL Web App in GET e verificare `ok: true`;
- inviare una submission Jotform di test e verificare che compaia una sola volta in `Moduli iscrizione` e una sola volta in `Iscritti`;
- ripetere lo stesso webhook/submission ID e verificare che non vengano creati duplicati;
- caricamento Dashboard;
- elenco Iscritti;
- elenco Prove;
- registrazione di una presenza test;
- registrazione di un pagamento test;
- rimozione dei dati test dal Course OS.

## Sicurezza
Il repository è pubblico, quindi:
- nessun token;
- nessun dato personale;
- nessuna credenziale;
devono essere committati nel codice.
