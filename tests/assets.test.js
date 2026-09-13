import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { publicTarget, prepareAssets, assetCredits } from "../server/assets.js";

const asset = {
  id: "chip",
  url: "https://example.com/chip.png",
  sourceUrl: "https://example.com/chip",
  title: "Example chip",
  creator: "Test author",
  license: "CC0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  alt: "A small test image",
};
test("asset destinations reject private addresses and pin public DNS results", async () => {
  for (const address of [
    "127.0.0.1",
    "10.2.3.4",
    "192.168.1.2",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "2001:db8::1",
  ]) {
    await assert.rejects(
      publicTarget("https://example.com/a", async () => [
        { address, family: address.includes(":") ? 6 : 4 },
      ]),
      /private/,
    );
  }
  await assert.rejects(publicTarget("http://example.com"), /HTTPS/);
  await assert.rejects(
    publicTarget("https://user:secret@example.com"),
    /credentials/,
  );
  assert.equal(
    (
      await publicTarget("https://example.com", async () => [
        { address: "8.8.8.8", family: 4 },
      ])
    ).address.address,
    "8.8.8.8",
  );
});
test("assets are normalized, retained offline, hashed and credited without repeated downloads", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-assets-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const bytes = await sharp({
    create: { width: 600, height: 300, channels: 3, background: "#00AA88" },
  })
    .jpeg()
    .toBuffer();
  let calls = 0;
  const fetchImage = async () => {
    calls++;
    return { bytes, url: asset.url };
  };
  const first = await prepareAssets([asset], dir, { fetchImage });
  const second = await prepareAssets([asset], dir, { fetchImage });
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.equal(first[0].width, 600);
  assert.match(assetCredits(first), /Test author.*CC0/);
  await fs.writeFile(path.join(dir, "chip.png"), "corrupt");
  await prepareAssets([asset], dir, { fetchImage });
  assert.equal(calls, 2);
  await assert.rejects(
    prepareAssets([asset, asset], dir, { fetchImage }),
    /unique/,
  );
  await assert.rejects(
    prepareAssets([{ ...asset, id: "../escape" }], dir, { fetchImage }),
  );
  await assert.rejects(
    prepareAssets([{ ...asset, url: "https://example.com/other" }], dir, {
      fetchImage: async () => ({
        bytes: Buffer.from('<svg><image href="file:///etc/passwd"/></svg>'),
        url: asset.url,
      }),
    }),
    /raster/,
  );
});
