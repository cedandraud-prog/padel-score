import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MatchControllerSnapshot } from '../application/MatchController'
import { MATCH_VOICE_COMMAND_HELP, MatchScreen } from './MatchScreen'

const snapshot = {
  phase: 'match',
  microphoneStatus: 'listening',
  recognitionAvailable: true,
  conversation: { isRunning: true },
  configuration: {
    teamA: { displayName: 'Champions', voiceName: 'Rouge' },
    teamB: { displayName: 'Invincibles', voiceName: 'Bleu' },
    servingTeam: 'A',
  },
  message: '',
  session: { state: 'IN_PROGRESS' },
  display: {
    isTieBreak: false,
    winner: null,
    teams: {
      A: {
        id: 'A',
        name: 'Champions',
        sets: 0,
        games: 0,
        points: '0',
        isServing: true,
        isWinner: false,
      },
      B: {
        id: 'B',
        name: 'Invincibles',
        sets: 0,
        games: 0,
        points: '0',
        isServing: false,
        isWinner: false,
      },
    },
  },
} as unknown as MatchControllerSnapshot

describe('MatchScreen', () => {
  it('affiche uniquement les commandes vocales supportées prévues par la Task', () => {
    expect(MATCH_VOICE_COMMAND_HELP.map(({ command }) => command)).toEqual([
      'Score',
      'Score complet',
      'Annuler',
      'Corriger',
      'Serveur',
      'Fin de match',
      'Oui',
      'Non',
      'Termine écoute',
    ])

    const html = renderToStaticMarkup(
      <MatchScreen
        snapshot={snapshot}
        onPoint={() => undefined}
        onUndo={() => undefined}
        onScore={() => undefined}
        onFullScore={() => undefined}
        onCorrect={() => undefined}
        onToggleListening={() => undefined}
        onNewMatch={() => undefined}
        onDisplayNameChange={() => undefined}
        onServingTeamChange={() => undefined}
      />,
    )

    expect(html).toContain('<span>Consignes vocales</span>')
    for (const { command, description } of MATCH_VOICE_COMMAND_HELP) {
      expect(html).toContain(command)
      expect(html).toContain(description)
    }
    expect(html).toContain('<dt>Rouge</dt>')
    expect(html).toContain('<dt>Bleu</dt>')
    expect(html).toContain('Commande : Rouge')
    expect(html).toContain('Commande : Bleu')
    expect(html).toContain('Changer les équipes')
    expect(html).toContain('Point équipe 1')
    expect(html).toContain('Point équipe 2')
    expect(html).toContain('À vous de parler')
    expect(html).toMatch(
      /class="control-button control-button--finish"[^>]*>[\s\S]*?<span>Fin de match<\/span><\/button>/,
    )
    expect(html).not.toContain('Recommencer')
  })

  it('affiche une confirmation manuelle sans clôturer au premier appui', () => {
    const html = renderToStaticMarkup(
      <MatchScreen
        snapshot={{ ...snapshot, phase: 'session-end-confirmation' }}
        onPoint={() => undefined}
        onUndo={() => undefined}
        onScore={() => undefined}
        onFullScore={() => undefined}
        onCorrect={() => undefined}
        onToggleListening={() => undefined}
        onNewMatch={() => undefined}
        onDisplayNameChange={() => undefined}
        onServingTeamChange={() => undefined}
      />,
    )

    expect(html).toContain('Confirmer la fin du match ?')
    expect(html).toContain('>Non</button>')
    expect(html).toContain('>Oui, terminer</button>')
    expect(html).not.toContain('control-button--finish')
    expect(html).toMatch(/Point équipe 1<\/button>/)
    expect(html).toMatch(/Point équipe 2<\/button>/)
    expect(html).toMatch(/disabled=""[^>]*>Point équipe 1/)
  })

  it('rend les points, jeux, sets et le serveur immédiatement lisibles', () => {
    const html = renderToStaticMarkup(
      <MatchScreen
        snapshot={snapshot}
        onPoint={() => undefined}
        onUndo={() => undefined}
        onScore={() => undefined}
        onFullScore={() => undefined}
        onCorrect={() => undefined}
        onToggleListening={() => undefined}
        onNewMatch={() => undefined}
        onDisplayNameChange={() => undefined}
        onServingTeamChange={() => undefined}
      />,
    )

    expect(html).toContain('aria-label="0 sets"')
    expect(html).toContain('aria-label="0 jeux"')
    expect(html).toContain('aria-label="0 points"')
    expect(html).toContain('aria-label="Champions est au service"')
    expect(html).toContain('aria-label="Donner le service à Invincibles"')
    expect(html).toContain('Modifier le nom affiché de Champions')
    expect(html).toContain('Prochain service <strong>Champions</strong>')
    expect(html).toContain('Désactiver l’écoute')
  })

  it('propose de réactiver une écoute suspendue', () => {
    const html = renderToStaticMarkup(
      <MatchScreen
        snapshot={{
          ...snapshot,
          microphoneStatus: 'disabled',
          conversation: { ...snapshot.conversation, isRunning: false },
        }}
        onPoint={() => undefined}
        onUndo={() => undefined}
        onScore={() => undefined}
        onFullScore={() => undefined}
        onCorrect={() => undefined}
        onToggleListening={() => undefined}
        onNewMatch={() => undefined}
        onDisplayNameChange={() => undefined}
        onServingTeamChange={() => undefined}
      />,
    )

    expect(html).toContain('Réactiver l’écoute')
  })

  it('n’affiche qu’une fois l’invitation à parler pendant l’écoute', () => {
    const html = renderToStaticMarkup(
      <MatchScreen
        snapshot={{ ...snapshot, message: 'À vous de parler' }}
        onPoint={() => undefined}
        onUndo={() => undefined}
        onScore={() => undefined}
        onFullScore={() => undefined}
        onCorrect={() => undefined}
        onToggleListening={() => undefined}
        onNewMatch={() => undefined}
        onDisplayNameChange={() => undefined}
        onServingTeamChange={() => undefined}
      />,
    )

    expect(html.match(/À vous de parler/g)).toHaveLength(1)
  })

  it('annonce la préparation tant que la capture audio n’est pas prête', () => {
    const html = renderToStaticMarkup(
      <MatchScreen
        snapshot={{ ...snapshot, microphoneStatus: 'starting' }}
        onPoint={() => undefined}
        onUndo={() => undefined}
        onScore={() => undefined}
        onFullScore={() => undefined}
        onCorrect={() => undefined}
        onToggleListening={() => undefined}
        onNewMatch={() => undefined}
        onDisplayNameChange={() => undefined}
        onServingTeamChange={() => undefined}
      />,
    )

    expect(html).toContain('Préparation du microphone')
    expect(html).not.toContain('Microphone en écoute')
  })

  it('affiche le serveur individuel et une sélection non ambiguë par côté', () => {
    const html = renderToStaticMarkup(
      <MatchScreen
        snapshot={{
          ...snapshot,
          phase: 'player-server-selection',
          configuration: {
            mode: 'PLAYERS_PLUS',
            teamA: snapshot.configuration!.teamA,
            teamB: snapshot.configuration!.teamB,
            firstServer: 'A1',
            participants: [],
          },
          currentPlayerServer: null,
          playerServerSelection: {
            purpose: 'SECOND_SERVER',
            teamId: 'B',
            teamName: 'Invincibles',
            awaitingSide: true,
            choices: [
              { id: 'B1', name: 'Camille', side: 'RIGHT' },
              { id: 'B2', name: 'Camille', side: 'LEFT' },
            ],
          },
        }}
        onPoint={() => undefined}
        onUndo={() => undefined}
        onScore={() => undefined}
        onFullScore={() => undefined}
        onCorrect={() => undefined}
        onToggleListening={() => undefined}
        onNewMatch={() => undefined}
        onDisplayNameChange={() => undefined}
        onServingTeamChange={() => undefined}
      />,
    )

    expect(html).toContain('Qui sert pour Invincibles ?')
    expect(html).toContain('Camille<small> — droite</small>')
    expect(html).toContain('Camille<small> — gauche</small>')
    expect(html).toContain(
      'Prochain service <strong>Sélection requise</strong>',
    )
  })
})
