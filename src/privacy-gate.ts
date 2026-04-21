import { App, Notice } from "obsidian";

/**
 * Thin wrapper around the Privacy Control Plane's shared API.
 *
 * The control plane is an *optional* sibling plugin. If it isn't installed, we
 * don't block the user — that would silently break every research call for
 * anyone who hasn't adopted the plane yet. Instead, `checkCloudEgress` is a
 * belt-and-braces layer: when present, it enforces policy; when absent, it
 * passes through.
 *
 * The plane exposes its API two ways — `window.enduserPrivacy` and
 * `app.plugins.plugins["privacy-control-plane"].api` — so we probe both.
 */

interface PolicyDecision {
	allowed: boolean;
	tier: string;
	reason: string;
	requiresConfirmation?: boolean;
}

interface PrivacyApi {
	apiVersion: number;
	canEgress(path: string, destination: string): Promise<PolicyDecision>;
	requestEgressConfirmed(
		path: string,
		destination: string
	): Promise<PolicyDecision>;
}

function getApi(app: App): PrivacyApi | null {
	const fromWindow = (window as unknown as { enduserPrivacy?: unknown })
		.enduserPrivacy;
	if (isPrivacyApi(fromWindow)) return fromWindow;
	const fromPlugins = (app as unknown as {
		plugins?: { plugins?: Record<string, { api?: unknown }> };
	}).plugins?.plugins?.["privacy-control-plane"]?.api;
	if (isPrivacyApi(fromPlugins)) return fromPlugins;
	return null;
}

function isPrivacyApi(candidate: unknown): candidate is PrivacyApi {
	if (!candidate || typeof candidate !== "object") return false;
	const c = candidate as Record<string, unknown>;
	return (
		typeof c.apiVersion === "number" &&
		typeof c.canEgress === "function" &&
		typeof c.requestEgressConfirmed === "function"
	);
}

/**
 * Ask the control plane whether `path` may be sent to `destination`.
 *
 * Returns true when there is no control plane installed (opt-in), when the
 * policy permits, or when the user confirms. Returns false and surfaces a
 * Notice when the policy blocks — callers should treat false as "stop".
 */
export async function checkCloudEgress(
	app: App,
	path: string,
	destination: string
): Promise<boolean> {
	const api = getApi(app);
	if (!api) return true;
	try {
		const decision = await api.canEgress(path, destination);
		if (decision.allowed) return true;
		if (decision.requiresConfirmation) {
			const confirmed = await api.requestEgressConfirmed(path, destination);
			if (confirmed.allowed) return true;
			new Notice(`Privacy policy blocked ${destination}: ${confirmed.reason}`);
			return false;
		}
		new Notice(`Privacy policy blocked ${destination}: ${decision.reason}`);
		return false;
	} catch (err) {
		new Notice(`Privacy check failed — aborting for safety: ${String(err)}`);
		return false;
	}
}

