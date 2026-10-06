# modelr

## Functies van de huidige versie

Modelr is een browsergebaseerde 3D-scène-editor voor eenvoudige scènes. De huidige versie bevat:

- Een interactieve 3D-viewport met Object Mode en Edit Mode, een Outliner met objectzichtbaarheid en eigenschappen voor het geselecteerde object. In Edit Mode kun je vertices, edges en driehoeksvlakken selecteren en verslepen; gedeelde kopieën van dezelfde mesh-punten bewegen mee. Driehoeksvlakken kunnen worden geëxtrudeerd of ingeïnset; gedeelde randen kunnen worden gebeveled. De bewerkingen ondersteunen undo en respecteren de scenelimiet.
- Basisvormen toevoegen: kubus, bol, cilinder, torus, kegel en kroon. Objecten selecteren, verplaatsen, draaien, schalen, dupliceren, hernoemen en verwijderen; de scène heeft ook ongedaan maken en opnieuw uitvoeren.
- Objecten aanpassen met positie- en schaalwaarden, kleur, ruwheid en metallic-waarde. Kubussen kunnen afgeronde randen krijgen.
- Animatietijdlijn op 24 fps met scrubben, frame-navigatie, afspelen/pauzeren, loopen en instelbaar eindframe. De dope sheet toont locatie-, rotatie-, schaal- en kleurtracks. De Animation Workspace is via de linkerwerkbalk of de tijdlijn te openen en bevat een Graph Editor (kanalen aanpassen door keyframes te slepen), NLA-editor (herbruikbare actions/strips, positie, herhalingen, snelheid, mix en mute), drivers met veilig beperkte wiskundige expressies en shape keys die je in Edit Mode kunt vastleggen en keyframen. Interpolatie ondersteunt Linear, Ease In/Out en Constant. Animatiedata wordt in lokale en cloudprojecten opgeslagen.
- glTF- en GLB-modellen importeren, met bijbehorende bestanden of vanuit een ZIP-archief; scènes exporteren als GLB.
- Gegenereerde Three.js-scènecode bekijken en aangepaste code toepassen voor de ondersteunde basisvormen.
- Projecten lokaal in de browser bewaren. Met een geconfigureerde PostgreSQL-database kunnen gebruikers accounts maken en projecten in de cloud bewaren.

De editor is bedoeld voor lichte scènes en begrenst een scène op 300 objecten en 250.000 driehoeken. De viewport is een realtime 3D-preview; er is geen aparte render-engine voor definitieve renders.

Edit Mode werkt met driehoeksvlakken; topologiegereedschappen zoals loop cut en het bewerken van volledige polygonen zijn niet beschikbaar. Animatie richt zich op de genoemde objectkanalen, shape-keywaarden en eenvoudige NLA-strips; geavanceerde rigging, constraint-gebaseerde drivers, animatiecurvemodifiers en export van animatieclips naar glTF zijn niet beschikbaar. Sculpting- of schildergereedschappen, modifiers, Geometry Nodes, rigging, fysica- of vloeistofsimulaties, geavanceerde materiaalnodes, compositing, videobewerking, cameratracking en Python-API zijn niet beschikbaar. De viewport-preview is geen definitieve render-engine.

## Cloudaccounts op Render

Accounts en projecten worden in PostgreSQL opgeslagen, zodat ze op meerdere apparaten werken en Render-deployments overleven. De webservice kan op Render Free blijven; koppel een PostgreSQL-database met een `DATABASE_URL`, bijvoorbeeld via het gratis Supabase-plan.

1. Maak een PostgreSQL-project aan bij je databaseprovider.
2. Kopieer de verbindingsstring. Houd deze privé; er staan databasegegevens in.
3. Open in Render bij de Modelr-service **Environment** en voeg `DATABASE_URL` toe met die verbindingsstring. De `render.yaml`-blueprint vraagt ook om deze waarde.
4. Sla de instelling op en deploy opnieuw. Modelr maakt de benodigde tabellen automatisch aan.

Meld je na de deploy één keer aan via **Sign in** op het apparaat met je oude browseraccount. Modelr zet dat account en de opgeslagen projecten dan over naar de database. Daarna kun je op andere apparaten met hetzelfde e-mailadres en wachtwoord inloggen. Is het oude account daar niet meer beschikbaar, kies dan **Create account**; de lokaal opgeslagen projecten op dat apparaat worden meegenomen.