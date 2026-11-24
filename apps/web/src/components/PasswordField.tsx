import { useId, useState } from 'react';
import { TextField, type TextFieldProps } from './TextField';

/** Campo de contraseña con casilla para verla (el dueño le pasa la clave a otra persona). */
export function PasswordField(props: Omit<TextFieldProps, 'type'>) {
  const [visible, setVisible] = useState(false);
  const checkId = useId();
  return (
    <div className="password-field">
      <TextField {...props} type={visible ? 'text' : 'password'} />
      <label className="check" htmlFor={checkId}>
        <input
          id={checkId}
          type="checkbox"
          checked={visible}
          onChange={(event) => setVisible(event.target.checked)}
        />
        Mostrar contraseña
      </label>
    </div>
  );
}
