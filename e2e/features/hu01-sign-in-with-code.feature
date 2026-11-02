@HU01
Feature: Sign in with an email code
  As an organizer, I want my account to be created when I verify my email with a code,
  without a password, and to sign in and out from any device,
  so that I manage all my events in one place without a sign-up form.

  Background:
    Given today is "2026-06-15" in "Europe/Madrid"
    And emails are delivered to a test mailbox

  Scenario: The first event of a browser creates the account
    Given I have filled the creation wizard as "Ana" with the email "ana@example.com"
    When I press "Crear"
    Then I see "Te hemos enviado un código a ana@example.com"
    When I type the code from the email sent to "ana@example.com"
    Then I see the "¡Hecho!" step with the participation link
    And the header shows that I am signed in as "Ana"
    And the event is owned by the account "ana@example.com"

  Scenario: A signed-in organizer creates an event without a code
    Given I am signed in as "ana@example.com"
    When I reach the last step of the creation wizard
    Then the email field shows "ana@example.com" and cannot be edited
    And I see "¿No eres tú? Cerrar sesión"
    When I press "Crear"
    Then I see the "¡Hecho!" step without being asked for a code

  Scenario: Signing in on another device shows all my events
    Given the account "ana@example.com" owns the events "Cena de verano" and "Excursión"
    And I am on the home page of a new browser
    When I press "Entrar" and sign in with "ana@example.com" and the emailed code
    Then I see "Mis eventos" listing "Cena de verano" and "Excursión"

  Scenario: A private page asks to sign in and then continues to it
    When I open "Mis eventos" without a session
    Then I am asked to sign in
    When I sign in with "ana@example.com" and the emailed code
    Then I see "Mis eventos"

  Scenario: Signing out deletes the session and the stored management links
    Given I am signed in as "ana@example.com"
    And I have opened the management page of my event "Cena de verano"
    When I choose "Cerrar sesión" in the header menu
    Then I see "Has cerrado sesión" on the home page
    And the API refuses my old session
    And this browser no longer opens the management page of "Cena de verano" without its link

  Scenario: A wrong code tells how many attempts are left
    Given I have been sent a code at "ana@example.com"
    When I type a wrong code
    Then I see "Código incorrecto. Te quedan 4 intentos."
    When I type a wrong code 4 more times
    Then I see "Demasiados intentos" and "Enviar código nuevo"
    And the right code is no longer accepted

  Scenario: An expired code asks for a new one
    Given I have been sent a code at "ana@example.com"
    And 11 minutes have passed
    When I type the code from the email
    Then I see "El código ha caducado" and "Enviar código nuevo"

  Scenario: The code can be resent after a countdown, and only the newest one works
    Given I have been sent a code at "ana@example.com"
    Then "Reenviar código" is disabled with a countdown
    When 30 seconds have passed and I press "Reenviar código"
    Then a second code is emailed to "ana@example.com"
    And the first code is no longer accepted

  Scenario: A mistyped email can be changed without losing the wizard
    Given I have filled the creation wizard with the email "ana@exmaple.com"
    And I have been sent a code at "ana@exmaple.com"
    When I press "Cambiar email"
    Then I am back on the last step with the title, dates and note I entered
    And no account or event exists for "ana@exmaple.com"

  Scenario: The wizard survives a reload while waiting for the code
    Given I have been sent a code at "ana@example.com" from the creation wizard
    When I reload the page
    Then I see the code screen for "ana@example.com"
    And the wizard still holds the title, dates and note I entered

  Scenario: The API refuses private requests without a valid session
    When the API is asked for "Mis eventos" without a session
    Then it answers 401
    When "bea@example.com" asks the API for the management data of an event owned by "ana@example.com"
    Then it answers 403
