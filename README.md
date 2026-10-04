# modelr

## Cloudaccounts op Render

Accounts en projecten worden in PostgreSQL opgeslagen, zodat ze op meerdere apparaten werken en Render-deployments overleven. De webservice kan op Render Free blijven; koppel een PostgreSQL-database met een `DATABASE_URL`, bijvoorbeeld via het gratis Supabase-plan.

1. Maak een PostgreSQL-project aan bij je databaseprovider.
2. Kopieer de verbindingsstring. Houd deze privé; er staan databasegegevens in.
3. Open in Render bij de Modelr-service **Environment** en voeg `DATABASE_URL` toe met die verbindingsstring. De `render.yaml`-blueprint vraagt ook om deze waarde.
4. Sla de instelling op en deploy opnieuw. Modelr maakt de benodigde tabellen automatisch aan.

Meld je na de deploy één keer aan via **Sign in** op het apparaat met je oude browseraccount. Modelr zet dat account en de opgeslagen projecten dan over naar de database. Daarna kun je op andere apparaten met hetzelfde e-mailadres en wachtwoord inloggen. Is het oude account daar niet meer beschikbaar, kies dan **Create account**; de lokaal opgeslagen projecten op dat apparaat worden meegenomen.