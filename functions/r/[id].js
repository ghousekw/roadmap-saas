export async function onRequestGet(context) {
  const { params, env } = context;
  const id = params.id;

  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return new Response(JSON.stringify({ error: "Invalid ID" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/roadmaps?public_id=eq.${id}&is_public=eq.true&select=topic,data,created_at`,
      {
        headers: {
          apikey: env.SUPABASE_KEY,
          Authorization: `Bearer ${env.SUPABASE_KEY}`,
        },
      }
    );

    const rows = await res.json();

    if (!rows?.length) {
      return new Response(JSON.stringify({ error: "Roadmap not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(rows[0]), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}