# MarkItDown Import — plugin Joplin

Importez des fichiers **Word, PowerPoint, Excel, PDF, HTML, EPUB, CSV**… dans
Joplin. Chaque fichier est converti en Markdown, devient une note dans le
carnet sélectionné, reçoit le tag **MarkItDown**, et peut garder le fichier
original en pièce jointe.

Tout se passe **dans le plugin** : pas de serveur, pas d'envoi réseau, pas de
compte. Le plugin est inspiré de [MarkItDown](https://github.com/microsoft/markitdown)
(Microsoft), mais la conversion est réimplémentée en JavaScript (voir
[Limites](#limites)).

## Installation

1. Téléchargez `markitdown-import.jpl` depuis la
   [page des releases](../../releases/latest).
2. Dans Joplin : **Outils → Options → Plugins** (Windows/Linux) ou
   **Joplin → Réglages → Plugins** (macOS), puis le bouton ⚙ →
   **Installer depuis un fichier** et choisissez le `.jpl`.
3. Redémarrez Joplin.

## Utilisation

Deux façons d'importer :

- **Fichier → Import → « Importer (autre) »** (en anglais : « Import (other) »).
  Une fenêtre de choix de fichier s'ouvre directement. Un fichier à la fois.
  Le libellé suit la langue de Joplin.
- **Outils → Importer avec MarkItDown…** : choix de plusieurs fichiers à la
  fois, avec un récapitulatif des réussites et des échecs.

Dans les deux cas, la note est créée dans le carnet sélectionné, ou dans un
carnet « MarkItDown » s'il n'y en a pas, et reçoit le tag **MarkItDown**.

### Réglages

**Options → MarkItDown Import** :

- **Joindre le fichier original à la note** (activé par défaut).

## Formats pris en charge

| Format | Ce qui est extrait |
|---|---|
| `.docx` | titres, paragraphes, listes, tableaux, liens, images intégrées |
| `.pptx` | texte de chaque diapositive, dans l'ordre |
| `.xlsx` | une section par feuille, en tableau Markdown |
| `.csv` | tableau Markdown |
| `.pdf` | texte (sans OCR : un PDF scanné donne peu de texte) |
| `.html`, `.htm` | conversion HTML → Markdown |
| `.odt` | titres, paragraphes, listes, tableaux, liens (OpenDocument, LibreOffice) |
| `.epub` | chapitres dans l'ordre de lecture |
| `.json`, `.xml` | bloc de code |
| `.ipynb` | cellules markdown et de code |
| `.txt`, `.md` | repris tels quels |

Non pris en charge : `.doc` et `.rtf` (enregistrez en `.docx`), `.xls`
(enregistrez en `.xlsx`), `.msg`,
`.zip`, images et audio (OCR, transcription).

## Langues

L'interface suit la langue de Joplin : anglais, français, allemand, espagnol,
italien et portugais. Une langue non prise en charge affiche l'anglais.
Les textes sont dans `src/i18n.js`. Pour ajouter une langue, copiez le bloc
`en` et traduisez les valeurs, puis ajoutez le code dans le fichier.

## Limites

- **Réimplémentation, pas le moteur officiel.** MarkItDown officiel est un
  paquet Python. Il ne peut pas tourner dans un plugin Joplin, qui n'exécute
  que du JavaScript. Le plugin s'appuie donc sur des bibliothèques JS
  (mammoth, unpdf, node-html-markdown, JSZip). Le rendu peut différer
  de MarkItDown, surtout pour les mises en page complexes.
- **PDF** : extraction de texte uniquement, pas d'OCR, pas de reconnaissance
  de tableaux.
- **Images des `.docx`** : intégrées en data-URI, ce qui peut alourdir la note.

## Développement

Prérequis : Node.js 22+.

```bash
npm install
npm test          # tests des convertisseurs et du plugin (sur le bundle)
npm run dist      # build dist/index.js puis publish/markitdown-import.jpl
```

Structure :

```
manifest.json            manifeste Joplin (id, version, titre)
src/index.js             plugin : commande, menu, tag, création de la note
src/convert.js           aiguillage selon l'extension
src/converters/          un module par famille de format
src/i18n.js              traductions (en, fr, de, es, it, pt)
tests/                   tests des convertisseurs et du bundle
scripts/pack.js          crée le .jpl (tar gzip : manifest.json + index.js)
webpack.config.js        bundle unique (pas de chunks séparés)
```

## Licence

Ce plugin est distribué sous licence MIT (voir [LICENSE](LICENSE)) : vous
pouvez l'utiliser, le modifier et le redistribuer librement, à condition de
conserver la notice de copyright et de mentionner l'auteur original.

Les bibliothèques embarquées gardent leurs propres licences. MarkItDown est
© Microsoft, MIT.
