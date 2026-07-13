# ADR-009 — Launch Experience

## Statut

Accepted

## Contexte

Le MLP doit pouvoir être essayé sur le téléphone d’un joueur sans passer par une boutique d’applications ni imposer un matériel particulier.

L’accès au produit doit être plus simple que son installation technique.

## Décision

PADEL SCORE est proposé en premier lieu comme Progressive Web App installable depuis Chrome sur Android.

Le parcours cible est :

1. ouvrir PADEL SCORE depuis une URL ;
2. l’ajouter à l’écran d’accueil ;
3. le relancer comme une application en plein écran ;
4. retrouver l’écran de lancement même lorsque le réseau est momentanément indisponible.

L’expérience de lancement évoluera selon la progression suivante :

```text
QR Code
  ↓
NFC
  ↓
Application native, uniquement si elle apporte une valeur supplémentaire
```

Le QR Code est le premier point d’entrée terrain. Il encode une URL stable vers la PWA et ne contient aucune logique métier.

Le NFC pourra ensuite ouvrir la même URL. Il ne créera pas une expérience produit distincte.

Une application native ne sera envisagée que si les limites réelles de la PWA empêchent une valeur supplémentaire validée, par exemple l’accès fiable à une capacité matérielle nécessaire.

## Expérience PWA

La PWA définit :

- un nom et un nom court ;
- une icône d’écran d’accueil ;
- une couleur de thème ;
- une couleur de fond ;
- un lancement sans interface de navigateur lorsque la plateforme le permet ;
- un écran de lancement cohérent avec l’identité PADEL SCORE ;
- un cache minimal de l’application après une première utilisation en ligne.

## Limite offline

Le chargement de l’interface peut fonctionner hors ligne après une première visite réussie.

Cette décision ne garantit pas le fonctionnement hors ligne de la reconnaissance vocale fournie par le navigateur. Cette capacité doit être vérifiée séparément sur le matériel et le réseau du test terrain.

## Conséquences

- aucune logique métier n’est déplacée dans la couche PWA ;
- le service worker gère uniquement l’installation, le lancement et le cache des ressources ;
- l’URL de déploiement doit rester stable pour permettre le QR Code puis le NFC ;
- le QR Code ne peut être produit définitivement qu’après validation de cette URL ;
- la distribution native n’est pas une étape automatique de la roadmap.

## Hors périmètre

Cette ADR ne définit pas :

- une boutique d’applications ;
- une application native ;
- un tag NFC ;
- une URL de production ;
- un fonctionnement vocal garanti hors ligne.
