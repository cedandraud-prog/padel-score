# SPIKE-001 — Audio Device Selection on Android Chrome

## Statut

**Conclusion technique établie — validation sur les appareils terrain à exécuter.**

Date de la revue : 13 juillet 2026.

## Question

Une Progressive Web App exécutée dans Chrome Android peut-elle choisir
explicitement le microphone utilisé par `SpeechRecognition` ?

## Décision

**Non, pas de manière exploitable et fiable dans Chrome Android stable.**

La réponse se décompose ainsi :

- Chrome Android peut **partiellement** sélectionner un microphone pour un flux
  `getUserMedia()` ;
- `SpeechRecognition` ne permet pas, sur Android Chrome stable, de garantir que
  ce flux sélectionné est sa source audio ;
- l'installation en PWA n'ajoute aucun droit de routage audio natif par rapport
  à la même page ouverte dans Chrome.

PADEL SCORE conserve donc le comportement actuel pour le MLP. Une sélection de
microphone avec `getUserMedia()` ne doit pas être ajoutée au produit tant que le
flux obtenu ne peut pas alimenter de façon fiable la reconnaissance vocale sur
Android.

## Expérimentations

### 1. Inventaire avec `enumerateDevices()`

La sonde expérimentale :

- demande d'abord l'autorisation du microphone afin d'obtenir les libellés que
  le navigateur accepte d'exposer ;
- liste séparément les périphériques `audioinput` et `audiooutput` ;
- affiche `label`, `deviceId` et `groupId` ;
- permet de relancer l'inventaire après la connexion ou la déconnexion d'un
  casque.

Chrome documente `enumerateDevices()` et `getUserMedia()` comme disponibles sur
Android. La liste reste toutefois celle que Chrome et Android décident
d'exposer : elle ne constitue pas un inventaire matériel complet.

**Résultat attendu sur appareil :** déterminer si le casque Bluetooth apparaît
comme `audioinput` distinct, comme périphérique par défaut ou pas du tout.

### 2. Sélection avec `getUserMedia()`

La sonde demande successivement :

```js
{
  audio: true
}
```

puis, pour le périphérique choisi :

```js
{
  audio: {
    deviceId: {
      exact: selectedDeviceId
    }
  }
}
```

Elle affiche le libellé et les réglages réels de la piste retournée, puis relie
le flux à un analyseur Web Audio. Le vumètre permet de comparer physiquement le
micro du téléphone et celui du casque.

**Résultat technique : partiel.** Un `deviceId` exposé peut être demandé pour un
`MediaStream`. Android conserve néanmoins la maîtrise du routage et peut ne pas
exposer le casque comme source distincte ou ne proposer que la source déjà
routée par le système.

### 3. Entrée de `SpeechRecognition`

La Web Speech API définit désormais deux formes :

```js
recognition.start()
recognition.start(audioTrack)
```

Sans piste, l'implémentation utilise le microphone par défaut. Le support de la
piste a été livré dans Chrome 135 sur ordinateur. L'Intent to Ship de Chromium
indique explicitement que la livraison initiale ne concernait que Windows,
macOS et Linux, pas Android. Un ticket Chromium Android toujours ouvert décrit
encore l'activation par le flag interne `MediaStreamTrackWebSpeech` et un
comportement erroné.

**Résultat technique sur Android Chrome stable : non.** Une PWA ne peut pas
s'appuyer sur `recognition.start(audioTrack)` pour imposer le flux choisi. Le
simple fait qu'un appel JavaScript avec un argument ne lève pas d'exception ne
prouve pas que l'argument est utilisé : une implémentation peut ignorer
l'argument et ouvrir le microphone système.

La sonde conserve les deux essais — `start()` et `start(track)` — et les trace
séparément pour détecter une éventuelle évolution d'une version future de
Chrome.

### 4. Page Chrome et PWA installée

La sonde est une mini-PWA autonome et affiche son mode d'exécution :

- `browser` pour la page Chrome classique ;
- `standalone` pour la version installée.

Les deux modes utilisent le même moteur Chromium et les mêmes API Web.
L'installation ne donne pas accès à `AudioManager` ni aux API Android natives
de sélection d'un périphérique de communication. Aucun écart de capacité n'est
donc attendu entre les deux modes ; la double exécution vérifie qu'aucun écart
propre à un appareil n'apparaît.

## Protocole de validation sur le téléphone terrain

### Préparation

1. Servir `experiments/audio-device-selection/` depuis une origine HTTPS.
2. Ouvrir une première fois la sonde comme page Chrome classique.
3. Autoriser le microphone, connecter le casque Bluetooth, puis actualiser la
   liste.
4. Répéter ensuite depuis la mini-PWA installée.

Pour un test local avec un poste relié en USB, un reverse port ADB vers
`localhost` permet également d'obtenir un contexte sécurisé sans intégrer la
sonde au produit.

Exemple depuis la racine du dépôt :

```text
npx vite experiments/audio-device-selection --host 127.0.0.1 --port 4174
adb reverse tcp:4174 tcp:4174
```

La sonde est alors accessible sur le téléphone à l'adresse
`http://localhost:4174`. `localhost` est traité comme un contexte sécurisé par
le navigateur. Pour un téléphone non relié en USB, utiliser un hébergement
HTTPS temporaire de ce seul dossier.

### Preuve du flux `getUserMedia()`

1. Sélectionner chaque `audioinput` exposé.
2. Démarrer le vumètre.
3. Éloigner et isoler le téléphone, puis parler et tapoter uniquement le micro
   du casque.
4. Refaire l'essai en tapotant uniquement le téléphone.
5. Noter le libellé et les réglages de la piste active.

### Preuve de la source de `SpeechRecognition`

1. Conserver le flux du casque actif dans le vumètre.
2. Lancer l'essai `start(audioTrack)`.
3. Isoler alternativement le téléphone puis le casque et prononcer deux phrases
   différentes.
4. Comparer avec l'essai `start()` sans piste.
5. Copier le rapport de diagnostic pour les deux modes d'installation.

Une transcription seule ne prouve pas la source. La preuve exige que la parole
ne soit audible que par l'un des deux microphones pendant chaque essai.

## Réponses aux questions

### 1. Chrome Android permet-il de sélectionner un microphone ?

**Partiellement.**

`enumerateDevices()` peut lister les entrées audio exposées et
`getUserMedia()` peut demander un `deviceId` exact. Cela sélectionne la source
d'un `MediaStream`, sous réserve que Chrome et Android exposent réellement le
périphérique. Ce choix ne change pas automatiquement le microphone système.

### 2. `SpeechRecognition` respecte-t-il ce choix ?

**Non sur Android Chrome stable, pour l'usage produit visé.**

`SpeechRecognition.start()` utilise le microphone par défaut. La surcharge
`start(audioTrack)` existe dans la spécification et dans Chrome ordinateur,
mais son support Android n'est pas livré comme capacité stable et fiable. Le
flux sélectionné par `getUserMedia()` ne peut donc pas être imposé à la
reconnaissance actuelle de PADEL SCORE.

### 3. Quelles sont les limitations connues ?

- contexte sécurisé et permission microphone obligatoires ;
- libellés et inventaire limités avant autorisation ;
- identifiants opaques, dépendants de l'origine et susceptibles de changer ;
- casque Bluetooth pas nécessairement exposé comme `audioinput` distinct ;
- routage Bluetooth dépendant d'Android, du profil actif et de l'appareil ;
- sélection `getUserMedia()` limitée au flux Web créé ;
- absence d'accès PWA aux API natives Android de routage de communication ;
- `start(audioTrack)` non fiable sur Android Chrome ;
- installation PWA sans privilège audio supplémentaire ;
- comportement susceptible de varier selon le téléphone, la version Android,
  Chrome et le casque.

Le fait qu'un casque soit correctement utilisé pendant un appel ne démontre
pas son utilisation par Chrome : une application Android native peut demander
un périphérique de communication via `AudioManager`, capacité non exposée à la
PWA.

### 4. Quelle stratégie pour PADEL SCORE ?

**D — Conserver le fonctionnement actuel et instaurer un protocole de
compatibilité matériel.**

- Pour le MLP, ne pas afficher de sélecteur qui donnerait une fausse garantie.
- Utiliser la sonde uniquement pour qualifier les couples
  téléphone/Android/Chrome/casque.
- Documenter les configurations terrain qui routent effectivement le casque au
  microphone système.
- Ne pas créer d'application native à ce stade.
- Réévaluer une application native uniquement si la sélection explicite du
  micro devient une condition de valeur validée sur le terrain.
- Réévaluer aussi l'option Web si Android livre un jour
  `start(MediaStreamTrack)` de manière stable, ou si la reconnaissance est
  remplacée par un moteur acceptant directement le `MediaStream` choisi.

L'option B (`getUserMedia()` seul) ne résout pas le besoin, car elle sélectionne
un flux que la Web Speech API Android ne consomme pas de façon maîtrisée.

## Sonde expérimentale

Fichiers : `experiments/audio-device-selection/`.

La sonde est volontairement extérieure à `src/` et à `public/`. Elle possède
son propre manifest et son propre service worker. Elle n'est ni liée, ni
importée, ni produite par le build PADEL SCORE. Elle peut être supprimée à la
fin de la campagne.

## Sources

- [Chrome Developers — Media devices](https://developer.chrome.com/blog/media-devices/)
- [MDN — SpeechRecognition.start()](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/start)
- [Chrome 135 release notes](https://developer.chrome.com/release-notes/135)
- [Chromium Intent to Ship — MediaStreamTrack Web Speech](https://groups.google.com/a/chromium.org/g/blink-dev/c/4ibjEVQ-i0s/m/oNde5hrICgAJ)
- [Chromium issue 395041973 — Android](https://issues.chromium.org/issues/395041973)
- [Android Developers — Audio routing](https://developer.android.com/develop/connectivity/bluetooth/ble-audio/audio-manager)

## Limite de cette revue

La compatibilité générale est établie à partir des API et de l'implémentation
officielle. Les résultats spécifiques au téléphone, au casque et aux deux modes
d'exécution restent une **validation terrain** : ils ne sont pas présentés ici
comme déjà obtenus. La décision produit ne dépend pas de ce résultat matériel,
car Android Chrome ne fournit pas aujourd'hui le chaînage fiable entre le flux
sélectionné et `SpeechRecognition`.
