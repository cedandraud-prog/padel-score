import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MatchControllerSnapshot } from '../application/MatchController'
import { MATCH_VOICE_COMMAND_HELP, MatchScreen } from './MatchScreen'

const snapshot = {
  phase: 'match',
  microphoneStatus: 'listening',
  recognitionAvailable: true,
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
      'Annuler',
      'Corriger',
      'Fin de match',
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

    expect(html).toContain('aria-label="Commandes vocales"')
    for (const { command } of MATCH_VOICE_COMMAND_HELP) {
      expect(html).toContain(command)
    }
    expect(html).not.toContain('Recommencer')
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
  })
})
