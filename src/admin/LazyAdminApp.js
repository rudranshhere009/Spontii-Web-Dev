import { lazy } from 'react'

/* Separate chunk: visitors to the user app never download the admin portal. */
export default lazy(() => import('./AdminApp.jsx'))
