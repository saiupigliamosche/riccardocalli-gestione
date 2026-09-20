# Deploy backend amministrativo

Il frontend PWA è già predisposto a collegarsi a un endpoint Apps Script esterno.

## 1. Crea un progetto Apps Script
Apri Google Apps Script con l'account `riccardo.calli@gmail.com`.

Crea un nuovo progetto, ad esempio:
`Parkour Course OS Admin Backend`

## 2. Copia il backend
Copia integralmente il contenuto di:
`backend/Code.gs`

nel file `Code.gs` del progetto Apps Script.

## 3. Imposta il token amministratore
In Apps Script:
Project Settings → Script Properties

Crea:
- Property: `ADMIN_TOKEN`
- Value: una stringa lunga e casuale, non riutilizzata altrove.

Non inserire questo token nel repository GitHub.

## 4. Distribuisci come Web App
Deploy → New deployment → Web app

Impostazioni:
- Execute as: Me
- Access: solo l'account appropriato se disponibile; in alternativa usare il token applicativo previsto dal backend.
- Copia l'URL `.../exec`.

## 5. Collega la PWA dal telefono
Apri la PWA gestionale.
Premi `COLLEGA BACKEND`.

Inserisci:
1. URL Web App Apps Script
2. ADMIN_TOKEN

I due valori vengono salvati solo nel localStorage del dispositivo.

## 6. Test minimo
Verificare:
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
