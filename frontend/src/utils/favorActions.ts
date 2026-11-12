import type { Favor } from '../services/api';
import { validityHoursOf } from './favorValidity';

/** Rotta per modificare un favore: «Crea» con i dati già compilati; al salvataggio si aggiorna quello, non se ne crea un altro. */
export const editFavorRoute = (favor: Favor) => ({
  pathname: '/create',
  params: {
    editId: favor.favor_id,
    title: favor.title,
    description: favor.description,
    category: favor.category,
    type: favor.type,
    durationHours: String(Math.max(1, Math.round(favor.duration_hours))),
    validityHours: String(validityHoursOf(favor)),
  },
});
