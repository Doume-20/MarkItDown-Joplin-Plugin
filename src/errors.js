import { t } from './i18n.js';

/** Erreur de conversion : le message est traduit dans la langue courante au moment où elle est levée. */
export class ConversionError extends Error {
	constructor(key, params = {}) {
		super(t(key, params));
		this.key = key;
		this.params = params;
	}
}

/** Message à afficher pour une erreur (les erreurs de conversion sont déjà traduites). */
export function describeError(err) {
	return err && err.message ? err.message : String(err);
}
