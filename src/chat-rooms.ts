import type { Room } from "./audit.ts";

// Which open streams should receive a given room's chat. Generic over the
// stream type so this stays pure and testable with plain fake objects — no
// real HTTP response, no server, no SSE framing involved here at all.
//
// A room with no subscribers returns no streams, never "everyone": there is
// no path through this class that defaults to a global broadcast. The
// server's only way to reach a stream with a chat event is through
// streamsFor, so this is the single place room isolation can be gotten
// wrong or gotten right.
export class ChatRoomRegistry<Stream> {
  private roomsByStream = new Map<Stream, Set<Room>>();

  // Replaces a stream's whole membership (its subscribed rooms), not
  // adds to it: a constellation change or a first star being created
  // recomputes the full set from scratch, so a stale room is never left
  // behind by accident.
  subscribe(stream: Stream, rooms: Iterable<Room>): void {
    this.roomsByStream.set(stream, new Set(rooms));
  }

  unsubscribe(stream: Stream): void {
    this.roomsByStream.delete(stream);
  }

  // Every open stream subscribed to `room`, filtered out of the full set of
  // open streams the caller already has. Taking `allStreams` rather than
  // iterating this registry's own keys means a stream that disconnected
  // without calling unsubscribe can never be handed back as a recipient.
  streamsFor(room: Room, allStreams: Iterable<Stream>): Stream[] {
    const out: Stream[] = [];
    for (const stream of allStreams) {
      if (this.roomsByStream.get(stream)?.has(room)) out.push(stream);
    }
    return out;
  }
}
