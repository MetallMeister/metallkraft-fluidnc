// Only the CNCjs synchronous string parser is used in the browser bundle.
const unavailable = () => { throw new Error('Node I/O is not available in the controller GUI'); };
export class Transform { constructor() { unavailable(); } }
export default { EventEmitter: unavailable, Readable: unavailable, createReadStream: unavailable, readFileSync: unavailable, setImmediate: unavailable };
