import { getUsers } from '@/lib/api';
import { NewDocumentForm } from './new-document-form';

export default async function NewDocumentPage() {
  const users = await getUsers();

  return (
    <div>
      <h1 className="page-title">New document</h1>
      <p className="page-subtitle">
        Create a document and build the workflow it has to go through.
      </p>
      <div className="mt-8">
        <NewDocumentForm users={users} />
      </div>
    </div>
  );
}
