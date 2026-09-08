import type { ApprovalEvent } from '@/lib/api';

function formatTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Group into rounds, preserving order. A new round starts on every rejection. */
function byRound(events: ApprovalEvent[]): { round: number; events: ApprovalEvent[] }[] {
  const rounds: { round: number; events: ApprovalEvent[] }[] = [];

  for (const event of events) {
    const last = rounds[rounds.length - 1];
    if (last && last.round === event.round) {
      last.events.push(event);
    } else {
      rounds.push({ round: event.round, events: [event] });
    }
  }
  return rounds;
}

export function HistoryTimeline({ events }: { events: ApprovalEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        Nothing has happened to this document yet.
      </p>
    );
  }

  const rounds = byRound(events);

  return (
    <div className="space-y-6">
      {rounds.map(({ round, events: inRound }) => (
        <div key={round}>
          {/* Only worth labelling once there has been more than one round. */}
          {rounds.length > 1 && (
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
              Round {round + 1}
            </div>
          )}

          <ol className="space-y-3">
            {inRound.map((event) => (
              <li key={event.id} className="flex gap-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    event.action === 'APPROVE' ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <div className="text-sm text-stone-900">
                    <span className="font-medium">{event.actor.name}</span>{' '}
                    {event.action === 'APPROVE' ? 'approved' : 'rejected'}
                    {/* The snapshot, not the live stage: a stage can be renamed after
                        the fact, and this is what the person actually acted on. */}
                    {event.stageSnapshot && (
                      <> {event.stageSnapshot.name}</>
                    )}
                  </div>

                  {event.comment && (
                    <p className="mt-1 text-sm text-stone-600">{event.comment}</p>
                  )}

                  <div className="mt-0.5 text-xs text-stone-400">
                    {formatTime(event.createdAt)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
