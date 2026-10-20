// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`): save a link in Linkwarden — the
// link of a camera clip, a page sent from a voice scene — and read the newest
// links, to send them in a message or speak them.
// -----------------------------------------------------------------------------

// The text output of "Read the latest links": one line per link.
export const lines = (links) =>
  links.map((link) =>
    link.url && link.url !== link.name ? `${link.name} — ${link.url}` : link.name,
  );

export const SCENE_ACTIONS = {
  async add_link(hub, { fields = {} }) {
    const saved = await hub.save({
      url: fields.url,
      name: fields.name,
      collection: fields.collection,
      tags: fields.tags,
    });
    const outputs = {
      name: saved.name,
      collection: saved.collection,
      already_saved: saved.existed,
    };
    if (saved.id !== null) {
      outputs.link_id = saved.id;
    }
    return outputs;
  },
  async read_latest(hub, { fields = {} }) {
    const links = await hub.readLatest({ collection: fields.collection, count: fields.count });
    return {
      count: links.length,
      links: lines(links).join('\n').slice(0, 10_000),
      latest_name: links[0]?.name ?? '',
      latest_url: links[0]?.url ?? '',
    };
  },
};
