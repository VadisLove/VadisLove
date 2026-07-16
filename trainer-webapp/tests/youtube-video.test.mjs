import assert from "node:assert/strict";
import test from "node:test";

import {
  buildYoutubeVideoUrl,
  parseYoutubeVideoUrl,
} from "../src/lib/youtube-video.ts";

const videoId = "AbC_123-xYz";

for (const url of [
  `https://www.youtube.com/watch?v=${videoId}`,
  `https://youtube.com/watch?v=${videoId}`,
  `https://m.youtube.com/watch?v=${videoId}`,
  `https://youtu.be/${videoId}`,
  `https://youtu.be/${videoId}?si=shared&t=12`,
  `https://www.youtube.com/watch?v=${videoId}&t=90&list=PL123`,
  `https://youtube.com/shorts/${videoId}?feature=share`,
  `https://www.youtube.com/embed/${videoId}`,
]) {
  test(`akzeptiert ${url}`, () => {
    assert.deepEqual(parseYoutubeVideoUrl(url), {
      ok: true,
      provider: "youtube",
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    });
  });
}

for (const url of [
  `http://www.youtube.com/watch?v=${videoId}`,
  "javascript:alert(1)",
  "data:text/html,video",
  "file:///tmp/video",
  `https://youtube.com.example.org/watch?v=${videoId}`,
  `https://example-youtube.com/watch?v=${videoId}`,
  `https://user:secret@youtube.com/watch?v=${videoId}`,
  "https://youtube.com/watch",
  "https://youtube.com/watch?v=short",
  "https://youtube.com/watch?v=AbC_123-xYz&v=ZZZ_123-xYz",
  `https://example.org/watch?v=${videoId}`,
  `https://youtube.com/redirect?q=https%3A%2F%2Fyoutu.be%2F${videoId}`,
  `https://youtu.be%2F${videoId}`,
  `https://youtube.com/%77atch%2F..%2Fwatch?v=${videoId}`,
  `https://youtube.com.:443/watch?v=${videoId}`,
  `https://youtube.com:444/watch?v=${videoId}`,
  `<iframe src="https://youtube.com/watch?v=${videoId}"></iframe>`,
]) {
  test(`lehnt ${url} ab`, () => {
    assert.equal(parseYoutubeVideoUrl(url).ok, false);
  });
}

test("erzeugt nur aus einer gültigen ID eine kontrollierte Adresse", () => {
  assert.equal(
    buildYoutubeVideoUrl(videoId),
    `https://www.youtube.com/watch?v=${videoId}`,
  );
  assert.equal(buildYoutubeVideoUrl("https://youtu.be/AbC_123-xYz"), null);
});
