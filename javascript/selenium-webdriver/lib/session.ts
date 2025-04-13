import { Capabilities } from './capabilities';

class Session {
  private id_: string;
  private caps_: Capabilities;

  /**
   * @param id The session ID.
   * @param capabilities The session capabilities, either as a Capabilities
   * object or as a plain object that can be passed to the Capabilities constructor.
   */
  constructor(id: string, capabilities: Capabilities | Record<string, unknown>) {
    this.id_ = id;
    // If capabilities is already an instance of Capabilities, use it.
    // Otherwise, create a new Capabilities instance.
    if (capabilities instanceof Capabilities) {
      this.caps_ = capabilities;
    } else {
      this.caps_ = new Capabilities(capabilities);
    }
  }

  /**
   * Returns the session ID.
   * @return The session's ID.
   */
  getId(): string {
    return this.id_;
  }

  /**
   * Returns the session capabilities.
   * @return The capabilities.
   */
  getCapabilities(): Capabilities {
    return this.caps_;
  }

  /**
   * Retrieves the value of a specific capability.
   * @param key The capability key.
   * @return The capability value.
   */
  getCapability(key: string): unknown {
    return this.caps_.get(key);
  }

  /**
   * Returns the JSON representation of this session, which is just the session ID.
   * @return The session ID.
   */
  toJSON(): string {
    return this.getId();
  }
}

export default Session;
