@HU02
Feature: Profile
  As a signed-in organizer, I want to see my profile and edit my name,
  so that my events show the name I choose.

  Background:
    Given I am signed in as "ana@example.com" with the name "Ana"

  Scenario: The profile shows my name and email
    When I choose "Perfil" in the header menu
    Then I see the name "Ana"
    And I see the email "ana@example.com", which cannot be edited

  Scenario: A new name is saved and used in the next event
    Given I own the event "Cena de verano" created as "Ana"
    When I change my name to "Ana María" in the profile and save
    Then I see "Guardado"
    And after a reload the profile shows "Ana María"
    And the creation wizard prefills the name "Ana María"
    And the voting page of "Cena de verano" still says "Ana ha propuesto unas fechas."

  Scenario Outline: An invalid name is not saved
    When I change my name to "<name>" in the profile
    Then I see a message next to the name field
    And the save button is disabled

    Examples:
      | name                                |
      |                                     |
      | A                                   |
      | Un nombre de más de treinta letras  |

  Scenario: The profile needs a session
    Given I have signed out
    When I open the profile page
    Then I am asked to sign in
