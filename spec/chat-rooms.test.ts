import { expect, it } from "vitest";
import { ChatRoomRegistry } from "../src/chat-rooms.ts";

// Pure, no server, no SSE: the room-isolation primitive chat delivery is
// built on. Real room keys (common, engineering) are used throughout, not a
// fake test-only room, so these checks exercise the same values the server
// actually uses.

it("a stream subscribed to a room is returned for that room", () => {
  const registry = new ChatRoomRegistry<string>();
  registry.subscribe("stream-a", ["common"]);
  expect(registry.streamsFor("common", ["stream-a"])).toEqual(["stream-a"]);
});

it("a stream subscribed only to engineering is excluded from common", () => {
  const registry = new ChatRoomRegistry<string>();
  registry.subscribe("stream-a", ["engineering"]);
  expect(registry.streamsFor("common", ["stream-a"])).toEqual([]);
});

it("a stream subscribed only to common is excluded from engineering", () => {
  const registry = new ChatRoomRegistry<string>();
  registry.subscribe("stream-a", ["common"]);
  expect(registry.streamsFor("engineering", ["stream-a"])).toEqual([]);
});

it("a room with zero subscribers returns no streams, even with other streams open — there is no fallback to everyone", () => {
  const registry = new ChatRoomRegistry<string>();
  registry.subscribe("stream-a", ["common"]);
  registry.subscribe("stream-b", ["common"]);
  // Neither stream is subscribed to engineering, so engineering's
  // recipient list must be empty, not "every open stream."
  expect(registry.streamsFor("engineering", ["stream-a", "stream-b"])).toEqual([]);
});

it("unsubscribing removes a stream from every room it held", () => {
  const registry = new ChatRoomRegistry<string>();
  registry.subscribe("stream-a", ["common", "engineering"]);
  registry.unsubscribe("stream-a");
  expect(registry.streamsFor("common", ["stream-a"])).toEqual([]);
  expect(registry.streamsFor("engineering", ["stream-a"])).toEqual([]);
});

it("a stream can hold multiple rooms at once", () => {
  const registry = new ChatRoomRegistry<string>();
  registry.subscribe("stream-a", ["common", "engineering"]);
  expect(registry.streamsFor("common", ["stream-a"])).toEqual(["stream-a"]);
  expect(registry.streamsFor("engineering", ["stream-a"])).toEqual(["stream-a"]);
  expect(registry.streamsFor("science", ["stream-a"])).toEqual([]);
});

it("re-subscribing replaces a stream's membership rather than adding to it", () => {
  const registry = new ChatRoomRegistry<string>();
  registry.subscribe("stream-a", ["common", "engineering"]);
  // A constellation change recomputes the whole set from scratch: leaving
  // engineering for science must drop engineering, not keep it alongside.
  registry.subscribe("stream-a", ["common", "science"]);
  expect(registry.streamsFor("engineering", ["stream-a"])).toEqual([]);
  expect(registry.streamsFor("science", ["stream-a"])).toEqual(["stream-a"]);
});

it("a stream not passed in allStreams is never returned, even if still subscribed", () => {
  const registry = new ChatRoomRegistry<string>();
  registry.subscribe("stream-a", ["common"]);
  // Simulates a disconnected stream whose unsubscribe never ran: the caller
  // only ever passes its own live eventStreams set, so a stale entry here
  // can never be handed back as a real recipient.
  expect(registry.streamsFor("common", [])).toEqual([]);
});
