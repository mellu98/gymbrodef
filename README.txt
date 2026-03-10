GYM BRO MASSI - CARTELLA PWA MODULARE

Contenuto:
- index.html -> app principale
- programs.json -> elenco schede / programmi
- app.webmanifest -> configurazione PWA
- sw.js -> cache offline base
- icons/ -> icone app

Come aggiornare una scheda:
1. Apri programs.json
2. Duplica o modifica un blocco dentro "programs"
3. Salva e fai nuovo deploy su Render

Struttura minima di un programma:
{
  "id": "nome-unico",
  "title": "Titolo scheda",
  "subtitle": "Sottotitolo",
  "weeks": "5 settimane",
  "days": [
    {
      "name": "Day 1",
      "label": "Petto & Spalle",
      "exercises": [
        {"name": "Panca", "series": 4, "reps": "8-10", "note": ""}
      ]
    }
  ]
}

Su Render:
- pubblica la cartella così com'è
- il file principale deve chiamarsi index.html
- tutti i file devono stare nella root, con la cartella icons/
