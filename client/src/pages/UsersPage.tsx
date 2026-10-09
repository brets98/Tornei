import { useEffect, useState } from 'react';
import { ApiError, apiGet } from '../lib/api';

interface User {
  id: string;
  name: string;
  surname: string;
  email: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
}

type State =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; users: User[] };

export function UsersPage() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    apiGet<User[]>('/users')
      .then((users) => setState({ status: 'ok', users }))
      .catch((err: unknown) =>
        setState({
          status: 'error',
          message:
            err instanceof ApiError && err.status === 403
              ? 'Only administrators can see the user list.'
              : 'Could not load the users.',
        }),
      );
  }, []);

  return (
    <article className="page">
      <h1>Users</h1>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p className="error">{state.message}</p>}
      {state.status === 'ok' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Surname</th>
                <th>Email</th>
                <th>Role</th>
                <th>Verified</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {state.users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.surname}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.emailVerified ? 'Yes' : 'No'}</td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
