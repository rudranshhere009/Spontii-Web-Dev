import { io } from 'socket.io-client'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

/*
 * The socket lives on the API's origin. In development that is the page's
 * own origin, and Vite proxies /socket.io to the API.
 *
 * The socket only receives: messages are always sent through the REST API,
 * which checks who may message whom.
 */
export const socket = io(new URL(API_BASE_URL, window.location.origin).origin, {
  autoConnect: false,
  withCredentials: true,
})
