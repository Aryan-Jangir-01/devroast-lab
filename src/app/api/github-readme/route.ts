import { NextResponse } from "next/server";

const REPO_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

function parseGitHubRepo(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\.git$/i, "").replace(/\/+$/, "");
  if (!trimmed) return null;

  if (REPO_PATTERN.test(trimmed)) {
    const [owner, repo] = trimmed.split("/");
    return { owner, repo };
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
      return null;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const candidate = `${parts[0]}/${parts[1]}`;
    if (!REPO_PATTERN.test(candidate)) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const parsed = parseGitHubRepo(body.url ?? "");
    if (!parsed) {
      return NextResponse.json(
        { error: "Enter a valid GitHub repo URL (e.g. https://github.com/owner/repo) or owner/repo." },
        { status: 400 }
      );
    }

    const { owner, repo } = parsed;
    const candidates = [
      { branch: "main", file: "README.md" },
      { branch: "master", file: "README.md" },
      { branch: "main", file: "readme.md" },
      { branch: "master", file: "readme.md" },
    ];

    for (const c of candidates) {
      const res = await fetch(
        `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${c.branch}/${c.file}`,
        { signal: AbortSignal.timeout(5500) }
      );
      if (res.ok) {
        const text = await res.text();
        if (text.trim().length > 0) {
          return NextResponse.json({
            ok: true,
            owner,
            repo,
            branch: c.branch,
            content: text.slice(0, 12000),
          });
        }
      }
    }

    return NextResponse.json(
      { error: `Could not locate README.md on main or master for ${owner}/${repo}.` },
      { status: 404 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch GitHub README." },
      { status: 500 }
    );
  }
}
