/**
 * This interface defines string parameters, required for
 * correct displaying of DeleteModal.
 */
export interface IDeleteModalTextParameters {
    /**
     * Header for the modal - text, which is displayed
     * in top most part of the modal before separating line.
     */
    modalHeader: string;

    /**
     * Contains information about the name of the object,
     * which we want to delete (e.g. bookmark, property, etc.)
     */
    modalCallingSource: string;
  }
