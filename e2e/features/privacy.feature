Feature: What qando does with personal data
  As anyone who gives qando a name or an email,
  I want one page that says what is kept, what for, for how long and how to have it deleted,
  so that I know what happens with my data when I give it.

  Scenario: Anyone reads the page at its own address
    When I open "/privacy"
    Then I see the heading "Privacidad y condiciones"
    And the tab title is "Privacidad y condiciones | qando"
    And I see "Pietro D’Agostino"

  Scenario: A participant reads it in a new tab and keeps the name typed
    Given today is "2026-06-15" in "Europe/Madrid"
    And a named event "Cena de verano" with the dates "2026-07-06", "2026-07-10" and "2026-07-11" and the deadline "2026-07-01"
    When I open the participation link and type the name "Lucía"
    And I open "Privacidad y condiciones" under the voting choices
    Then a new tab shows the heading "Privacidad y condiciones"
    And the voting page still holds the name "Lucía"

  Scenario: An organizer reaches it from the header menu
    Given I am signed in as "ana@example.com"
    When I open the home page
    And I choose "Privacidad y condiciones" in the header menu
    Then I see the heading "Privacidad y condiciones"
