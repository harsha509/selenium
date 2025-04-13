import { Network as getNetwork } from '../bidi/network';
import { InterceptPhase } from '../bidi/interceptPhase';
import { AddInterceptParameters } from '../bidi/addInterceptParameters';

/**
 * Represents the authentication data for a given handler.
 */
interface AuthHandler {
  username: string;
  password: string;
  uri: string;
}

/**
 * Represents the subset of the BiDi Network API used by this module.
 */
interface BidiNetwork {
  addIntercept(params: AddInterceptParameters): Promise<void>;
  authRequired(
    callback: (event: { request: { request: string; url: string } }) => Promise<void>
  ): Promise<void>;
  continueWithAuth(
    requestId: string,
    username: string,
    password: string
  ): Promise<void>;
  continueWithAuthNoCredentials(requestId: string): Promise<void>;
}

export default class Network {
  // Private fields
  #callbackId: number = 0;
  #driver: unknown;
  #network: BidiNetwork | undefined;
  #authHandlers: Map<number, AuthHandler> = new Map();

  constructor(driver: unknown) {
    this.#driver = driver;
  }

  /**
   * Initializes the network instance (if not already done).
   * Since async calls cannot be done in the constructor,
   * this method performs the necessary asynchronous setup.
   */
  async #init(): Promise<void> {
    if (this.#network !== undefined) {
      return;
    }
    this.#network = await getNetwork(this.#driver) as BidiNetwork;

    await this.#network.addIntercept(new AddInterceptParameters(InterceptPhase.AUTH_REQUIRED));

    await this.#network.authRequired(async (event: { request: { request: string; url: string } }) => {
      const requestId: string = event.request.request;
      const uri: string = event.request.url;
      const credentials: AuthHandler | undefined = this.getAuthCredentials(uri);
      if (credentials !== undefined) {
        await this.#network!.continueWithAuth(requestId, credentials.username, credentials.password);
        return;
      }
      await this.#network!.continueWithAuthNoCredentials(requestId);
    });
  }

  /**
   * Finds any authentication handler whose URI pattern matches the provided URI.
   * @param uri The request URI.
   * @returns The corresponding authentication data, or undefined if none is found.
   */
  getAuthCredentials(uri: string): AuthHandler | undefined {
    for (const [, value] of this.#authHandlers) {
      if (uri.match(value.uri)) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Adds an authentication handler.
   * @param username The username for authentication.
   * @param password The password for authentication.
   * @param uri (optional) A string pattern to match against request URIs (defaults to '//').
   * @returns A numeric identifier for the added handler.
   */
  async addAuthenticationHandler(
    username: string,
    password: string,
    uri: string = '//'
  ): Promise<number> {
    await this.#init();
    const id: number = this.#callbackId++;
    this.#authHandlers.set(id, { username, password, uri });
    return id;
  }

  /**
   * Removes an authentication handler by its identifier.
   * @param id The identifier of the handler to remove.
   * @throws An error if no handler is found for the given id.
   */
  async removeAuthenticationHandler(id: number): Promise<void> {
    await this.#init();
    if (this.#authHandlers.has(id)) {
      this.#authHandlers.delete(id);
    } else {
      throw new Error(`Callback with id ${id} not found`);
    }
  }

  /**
   * Clears all authentication handlers.
   */
  async clearAuthenticationHandlers(): Promise<void> {
    this.#authHandlers.clear();
  }
}
