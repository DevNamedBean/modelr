# modelr

## Functies van de huidige versie

Modelr is een browsergebaseerde 3D-scène-editor voor eenvoudige scènes. De huidige versie bevat:

- Een interactieve 3D-viewport met Object Mode, Edit Mode en Sculpt Mode, een Outliner met objectzichtbaarheid en eigenschappen voor het geselecteerde object. In Edit Mode kun je vertices, edges en driehoeksvlakken selecteren en verslepen; gedeelde kopieën van dezelfde mesh-punten bewegen mee. Driehoeksvlakken kunnen worden geëxtrudeerd of ingeïnset; gedeelde randen kunnen worden gebeveled. Sculpt Mode biedt Draw-, Inflate-, Crease-, Grab- en Smooth-penselen met instelbare grootte en sterkte. De meshbewerkingen ondersteunen undo en respecteren de scenelimiet.
- Basisvormen toevoegen: kubus, bol, cilinder, torus, kegel en kroon. Objecten selecteren, verplaatsen, draaien, schalen, dupliceren, hernoemen en verwijderen; sleep een geselecteerd object direct om het in het kijkvlak te verplaatsen, of gebruik de Move-tool voor vrije of as-beperkte verplaatsing. De Scale-tool heeft een middenhandgreep voor uniforme schaal en buitenhandgrepen voor afzonderlijke assen. Positie en schaal kunnen ook nauwkeurig met de velden of uniforme schaalregelaar worden ingesteld. De scène heeft ook ongedaan maken en opnieuw uitvoeren.
- Objecten aanpassen met positie- en schaalwaarden, inclusief een uniforme schaalregelaar en afzonderlijke X/Y/Z-waarden, basiskleur, ruwheid, metallic-waarde, emissiekleur en -sterkte, transparantie en een uploadbare afbeelding als materiaaltextuur. De afbeeldingstextuur wordt verkleind/gecomprimeerd en bewaard in projecten; de overige materiaalinstellingen worden ook meegenomen in de gegenereerde Three.js-code. Kubussen kunnen afgeronde randen krijgen.
- glTF- en GLB-modellen importeren, met bijbehorende bestanden of vanuit een ZIP-archief; scènes exporteren als GLB.
- Gegenereerde Three.js-scènecode bekijken en aangepaste code toepassen voor de ondersteunde basisvormen.
- Projecten lokaal in de browser bewaren. Een nieuw project moet eerst een naam krijgen voordat je ermee kunt werken; projecten worden daarna automatisch opgeslagen bij wijzigingen, wanneer de pagina verborgen of afgesloten wordt, en voordat je een project sluit of wisselt. Toegevoegde, gekopieerde, geïmporteerde en uit code toegepaste parts worden ook automatisch opgeslagen. Met een geconfigureerde PostgreSQL-database kunnen gebruikers accounts maken en projecten in de cloud bewaren.

De editor is bedoeld voor lichte scènes en begrenst een scène op 300 objecten en 250.000 driehoeken. De viewport is een realtime 3D-preview; er is geen aparte render-engine voor definitieve renders.

Edit Mode werkt met driehoeksvlakken; topologiegereedschappen zoals loop cut en het bewerken van volledige polygonen zijn niet beschikbaar. Sculpt Mode biedt basispenselen, maar geen Dyntopo, multiresolution, maskers, face sets of verfmodi. Modifiers, Geometry Nodes, rigging, fysica- of vloeistofsimulaties, geavanceerde materiaalnodes, compositing, videobewerking, cameratracking en Python-API zijn niet beschikbaar. De viewport-preview is geen definitieve render-engine.

## Wat kun je met Blender?

Deze algemene uitleg beschrijft mogelijkheden van Blender. Het is geen lijst met functies die allemaal in Modelr beschikbaar zijn; zie **Functies van de huidige versie** en de beperkingen hierboven voor wat Modelr momenteel ondersteunt.

### 1. 3D-modellen maken

Je kunt in Blender vrijwel ieder object maken dat je kunt bedenken. Denk aan auto's, huizen, meubels, robots, machines, dieren, wapens, gebouwen en fantasieobjecten.

Je begint meestal met eenvoudige vormen zoals een kubus, bol of cilinder. Die kun je vervolgens aanpassen door punten, lijnen en vlakken te verplaatsen. Met gereedschappen zoals Extrude, Inset, Bevel, Loop Cut en Boolean kun je steeds complexere modellen maken.

Er zijn verschillende manieren om te modelleren. Bij harde objecten, zoals auto's en machines, gebruik je vaak polygon modeling en modifiers. Voor organische modellen, zoals mensen en monsters, kun je bijvoorbeeld sculpting gebruiken.

### 2. Sculpting

Met Sculpt Mode kun je een model behandelen alsof het digitale klei is. Je kunt delen van een model naar buiten trekken, indrukken, gladstrijken of juist extra detail toevoegen.

Dit is vooral handig voor gezichten, dieren, monsters en andere organische vormen. Je kunt er zeer kleine details mee maken, zoals huidplooien, spieren, rimpels en andere oppervlaktedetails.

### 3. Characters maken

Je kunt complete menselijke of fantasiepersonages maken. Daarbij maak je eerst het lichaam en hoofd. Vervolgens kun je kleding, schoenen, haar, ogen en andere onderdelen toevoegen. Daarna kun je het personage voorbereiden voor animatie door middel van rigging.

### 4. Rigging

Rigging betekent dat je een digitaal skelet aan een 3D-model toevoegt. Het skelet bestaat uit zogenaamde bones. Je kunt bijvoorbeeld botten voor de rug, armen, handen, benen en vingers maken.

Vervolgens koppel je het model aan het skelet. Als je daarna een bot beweegt, beweegt het bijbehorende gedeelte van het model mee. Dit is essentieel wanneer je bijvoorbeeld een personage wilt laten lopen, rennen, springen of praten.

### 5. Animatie

Blender heeft uitgebreide mogelijkheden voor animatie. Je kunt vrijwel iedere eigenschap van een object animeren. Je kunt bijvoorbeeld de positie, rotatie, grootte, kleur, camera, verlichting en materialen in de tijd laten veranderen.

Je gebruikt hiervoor meestal keyframes. Je geeft Blender bijvoorbeeld aan waar een object zich aan het begin en einde van een beweging moet bevinden. Blender berekent vervolgens de tussenliggende beweging. Je kunt hiermee complete animatiefilms maken.

### 6. Materialen

Een 3D-model hoeft er natuurlijk niet standaard grijs uit te zien. Je kunt materialen maken voor bijvoorbeeld metaal, hout, plastic, glas, rubber, steen, goud, huid, beton en allerlei andere oppervlakken.

Je kunt onder andere instellen welke kleur een object heeft, hoeveel het reflecteert, hoe ruw of glad het oppervlak is en hoe transparant het materiaal is. Hiermee kun je een eenvoudige 3D-kubus bijvoorbeeld laten lijken op glas, goud, hout of plastic.

### 7. Textures

Textures geven extra details aan een object. Een muur kan bijvoorbeeld een betontextuur krijgen. Een houten tafel kan een houtpatroon krijgen. Een auto kan krassen, vuil of logo's krijgen.

Je kunt bestaande textures gebruiken, maar je kunt ze ook zelf maken of in Blender schilderen.

### 8. Belichting

Je kunt je scène helemaal zelf verlichten. Je kunt bijvoorbeeld zonlicht, lampen, spotlights en grote zachte lichtbronnen gebruiken.

Daarmee kun je bepalen hoe je scène eruitziet. Je kunt bijvoorbeeld een donkere horrorachtige scène maken, een heldere zonnige omgeving of een professionele productfoto. Belichting is enorm belangrijk voor het uiteindelijke uiterlijk van een render.

### 9. Camera's

Je kunt in Blender één of meerdere virtuele camera's gebruiken. Je kunt de camera positioneren, draaien en animeren. Je kunt ook verschillende lenzen gebruiken en bijvoorbeeld scherptediepte toepassen.

Daarmee kun je filmische camerabewegingen maken en bepalen vanuit welke hoek je je 3D-wereld bekijkt.

### 10. Renderen

Wanneer je klaar bent met je 3D-scène, kun je deze renderen. Renderen betekent dat Blender de scène omzet in een uiteindelijke afbeelding of video.

Blender heeft onder andere Cycles en Eevee als rendertechnologieën. Cycles is gericht op zeer realistische resultaten, terwijl Eevee vooral gericht is op snelle rendering.

### 11. Werelden en omgevingen bouwen

Je kunt niet alleen losse objecten maken. Je kunt complete werelden bouwen. Je kunt bijvoorbeeld een middeleeuwse stad maken met huizen, straten, bomen, bruggen, winkels en een kasteel.

Je kunt ook een futuristische stad, buitenaardse planeet, ruimteschip, bos, woestijn of onderwaterwereld maken.

### 12. Physics en simulaties

Blender kan bepaalde natuurkundige effecten simuleren. Je kunt bijvoorbeeld objecten laten vallen en tegen elkaar laten botsen. Je kunt ook vloeistoffen, rook, vuur en andere effecten simuleren.

Dit is handig voor bijvoorbeeld explosies, instortende gebouwen, vallende objecten en andere visuele effecten.

### 13. Kleding simuleren

Blender kan ook stoffen simuleren. Je kunt bijvoorbeeld een shirt, broek, gordijn, vlag of deken maken en Blender laten berekenen hoe de stof beweegt.

Je kunt daarbij rekening houden met beweging, zwaartekracht en botsingen met andere objecten.

### 14. Haar, gras en vacht

Je kunt in Blender ook systemen maken voor haar, vacht, gras en andere vergelijkbare effecten. Daarmee kun je bijvoorbeeld een harige hond maken, een personage met lang haar of een groot grasveld.

Voor grote hoeveelheden objecten is Geometry Nodes hierbij erg krachtig.

### 15. Geometry Nodes

Geometry Nodes is een van de geavanceerdere onderdelen van Blender. Hiermee kun je procedurele systemen maken. In plaats van duizenden objecten handmatig te plaatsen, laat je Blender ze automatisch genereren.

Je kunt bijvoorbeeld een systeem maken waarmee automatisch bomen over een landschap worden verspreid. Je kunt ook gebouwen, stenen, gras, kabels, patronen en allerlei complexe geometrie procedureel genereren.

Het grote voordeel is dat je parameters kunt aanpassen en het hele systeem automatisch opnieuw laat berekenen.

### 16. Architectuur

Blender kan worden gebruikt om gebouwen en interieurs te maken. Je kunt huizen, kantoren, winkels en andere gebouwen modelleren.

Daarna kun je meubels plaatsen, materialen toevoegen, verlichting instellen en realistische afbeeldingen van het gebouw maken. Dit wordt vaak gebruikt voor architectuurvisualisaties.

### 17. Productvisualisaties

Je kunt ook producten volledig digitaal maken. Denk bijvoorbeeld aan telefoons, auto's, horloges, meubels, schoenen, flessen of elektronische apparaten.

Je kunt het product modelleren, materialen toevoegen, professioneel belichten en vervolgens een afbeelding maken. Dit kan bijvoorbeeld gebruikt worden voor reclame of productpresentaties.

### 18. Game-assets maken

Blender wordt veel gebruikt voor het maken van onderdelen voor videogames. Je kunt bijvoorbeeld characters, gebouwen, voertuigen, wapens, meubels, bomen en andere objecten maken.

Daarna kun je deze modellen exporteren naar een game-engine. Blender zelf is vooral bedoeld voor het maken van de 3D-content. Voor de daadwerkelijke game-logica gebruik je meestal een aparte game-engine.

### 19. Films en VFX

Je kunt Blender gebruiken voor visuele effecten in films en video's. Je kunt bijvoorbeeld een echte video combineren met digitale 3D-objecten.

Denk aan een ruimteschip dat door een echte stad vliegt, een digitaal monster dat naast een acteur staat of een volledig digitale explosie.

### 20. Compositing

Blender heeft ook een compositor. Daarmee kun je verschillende beelden en effecten met elkaar combineren.

Je kunt bijvoorbeeld een gerenderd 3D-object combineren met echte videobeelden en vervolgens kleuren, licht, effecten en andere elementen aanpassen.

### 21. 2D-animatie

Blender kan ook voor 2D-animatie worden gebruikt. Met Grease Pencil kun je 2D-tekeningen maken en animeren binnen Blender.

Je kunt daarmee bijvoorbeeld tekenfilms, illustraties en hybride 2D/3D-animaties maken.

### 22. 3D-printing

Je kunt modellen die je in Blender maakt ook voorbereiden voor 3D-printing. Je kunt bijvoorbeeld beeldjes, prototypes, onderdelen, decoraties en andere objecten maken.

Daarbij moet je wel rekening houden met zaken zoals schaal, wanddikte en de technische eisen van je 3D-printer.

### 23. Python en automatisering

Blender heeft een Python-interface. Dat betekent dat je Blender met Python kunt programmeren.

Je kunt bijvoorbeeld scripts maken die automatisch objecten creëren, materialen instellen, scènes opbouwen of honderden objecten tegelijk aanpassen. Hiermee kun je repetitieve werkzaamheden automatiseren.

### 24. Wetenschappelijke en technische visualisaties

Blender kan ook worden gebruikt om ingewikkelde onderwerpen visueel uit te leggen. Je kunt bijvoorbeeld machines, anatomie, moleculen, planeten of technische constructies in 3D maken.

Dat kan handig zijn voor educatie, presentaties en technische demonstraties.

### 25. VR en AR

Je kunt Blender gebruiken om 3D-modellen en omgevingen te maken voor virtual reality en augmented reality. Je maakt bijvoorbeeld een gebouw, voertuig of virtuele omgeving in Blender en exporteert deze vervolgens naar een geschikt platform.

### Kortom

Met Blender kun je onder andere:

- 3D-modellen maken
- Characters maken
- Sculpten
- Riggen
- Animeren
- Materialen maken
- Textures maken
- Werelden bouwen
- Belichten
- Renderen
- Films maken
- VFX maken
- Rook en vuur simuleren
- Water simuleren
- Kleding simuleren
- Haar en vacht maken
- Architectuur visualiseren
- Producten ontwerpen
- Game-assets maken
- 2D-animaties maken
- 3D-printmodellen maken
- Procedurele werelden maken met Geometry Nodes
- Automatiseren met Python
- VR/AR-assets maken

## Cloudaccounts op Render

Accounts en projecten worden in PostgreSQL opgeslagen, zodat ze op meerdere apparaten werken en Render-deployments overleven. De webservice kan op Render Free blijven; koppel een PostgreSQL-database met een `DATABASE_URL`, bijvoorbeeld via het gratis Supabase-plan.

1. Maak een PostgreSQL-project aan bij je databaseprovider.
2. Kopieer de verbindingsstring. Houd deze privé; er staan databasegegevens in.
3. Open in Render bij de Modelr-service **Environment** en voeg `DATABASE_URL` toe met die verbindingsstring. De `render.yaml`-blueprint vraagt ook om deze waarde.
4. Sla de instelling op en deploy opnieuw. Modelr maakt de benodigde tabellen automatisch aan.

Meld je na de deploy één keer aan via **Sign in** op het apparaat met je oude browseraccount. Modelr zet dat account en de opgeslagen projecten dan over naar de database. Daarna kun je op andere apparaten met hetzelfde e-mailadres en wachtwoord inloggen. Is het oude account daar niet meer beschikbaar, kies dan **Create account**; de lokaal opgeslagen projecten op dat apparaat worden meegenomen.

## Doneren

Modelr accepteert vrijwillige Litecoin-donaties. Kies **Donate LTC** op het aanmeldscherm of in de editor om het walletadres te zien, te kopiëren of in een Litecoin-wallet te openen:

`ltc1qqwwae8r7vza8rythzx8nkcr3925zlzemhhzw47`