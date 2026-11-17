@HU03
Feature: Create an event with date and time options
  As an organizer, I want to create an event with date and time options,
  without filling a sign-up form, so that my group can tell me when they can meet.

  Background:
    Given today is "2026-06-15" in "Europe/Madrid"

  @wip
  Scenario: An event with dates only is created and gets its links
    Given I am signed in as "ana@example.com" with the name "Ana"
    When I create the event "Cena de verano" with the dates "2026-07-06" and "2026-07-10"
    Then I see the "¡Hecho!" step with the participation link
    And the participation link shows the options:
      | option         |
      | lun 6 jul      |
      | vie 10 jul     |
    And the event has a management link and a results link, both different from the participation link

  @wip
  Scenario: Each time is one option and a date without times is a whole day
    Given I am signed in as "ana@example.com" with the name "Ana"
    When I create the event "Cena de verano" with the options:
      | dates      | time        |
      | 2026-07-06 | 18:15       |
      | 2026-07-06 | 20:00-22:00 |
      | 2026-07-10 |             |
    Then participants vote on exactly these 3 options, in this order:
      | option                  |
      | lun 6 jul, 18:15        |
      | lun 6 jul, 20:00–22:00  |
      | vie 10 jul, sin horario |

  @wip
  Scenario: Overlapping options are kept apart
    Given I am signed in as "ana@example.com" with the name "Ana"
    When I create the event "Viaje" with the options:
      | dates                 |
      | 2026-07-06..2026-07-09 |
      | 2026-07-08            |
    Then participants vote on 2 options

  @wip
  Scenario: The summary lists every option as it will be voted
    Given I have chosen the date "2026-07-10" and the date "2026-07-06" with the times "20:00-22:00" and "18:15"
    When I reach the summary step
    Then it lists, in this order:
      | option                  |
      | lun 6 jul, 18:15        |
      | lun 6 jul, 20:00–22:00  |
      | vie 10 jul, sin horario |

  @wip
  Scenario: The event survives an API restart
    Given I am signed in as "ana@example.com" with the name "Ana"
    And I have created the event "Cena de verano"
    When the API restarts
    Then the participation link still shows "Cena de verano" with its options

  Scenario: "Siguiente" stays disabled until the step is valid
    When I open the creation wizard
    Then "Siguiente" is disabled
    And no field is marked as valid
    And screen readers hear with "Siguiente": "Completa tu nombre y el título del evento."
    When I type my name "Ana"
    Then only the name field is marked as valid
    And screen readers hear with "Siguiente": "Completa el título del evento."
    When I type the title "Cena de verano"
    Then both fields are marked as valid
    And "Siguiente" is enabled

  Scenario: Enter goes to the dates step once the step is valid
    Given I have opened the creation wizard
    When I type my name "Ana" and press Enter
    Then I am still on step 1
    When I type the title "Cena de verano" and press Enter
    Then I am on step 2

  Scenario: Days are marked and removed one by one on the calendar
    Given I am on the dates step of the creation wizard
    Then the calendar shows "Junio 2026"
    And "Siguiente" is disabled
    And screen readers hear with "Siguiente": "Selecciona al menos una fecha."
    When I press the day "2026-06-20"
    And I press the day "2026-06-21"
    Then the marked days are:
      | day        |
      | 2026-06-20 |
      | 2026-06-21 |
    And "Siguiente" is enabled
    When I press the day "2026-06-20"
    Then the marked days are:
      | day        |
      | 2026-06-21 |

  Scenario: The calendar goes from today to twelve months ahead
    Given I am on the dates step of the creation wizard
    Then the day "2026-06-14" cannot be chosen
    And the calendar cannot go to the previous month
    When I go 12 months forward
    Then the calendar shows "Junio 2027"
    And the day "2027-06-15" can be chosen
    But the day "2027-06-16" cannot be chosen
    And the calendar cannot go to the next month

  Scenario: The dates and the month on screen are kept while visiting step 1
    Given I am on the dates step of the creation wizard
    When I go 1 month forward
    And I press the day "2026-07-06"
    And I go back to step 1 and on to the dates again
    Then the calendar shows "Julio 2026"
    And the marked days are:
      | day        |
      | 2026-07-06 |

  Scenario: The calendar is used with the keyboard alone
    Given I am on the dates step of the creation wizard
    When I reach the days of the calendar with the Tab key
    Then the focus is on the day "2026-06-15"
    When I press the key "ArrowDown" 3 times
    Then the calendar shows "Julio 2026"
    And the focus is on the day "2026-07-06"
    When I press the key "Enter" 1 time
    Then the marked days are:
      | day        |
      | 2026-07-06 |

  Scenario: A drag joins days into a range, and a second drag stops next to it
    Given I am on the dates step of the creation wizard
    When I drag from the day "2026-06-18" to the day "2026-06-20"
    Then the dates on the calendar are:
      | dates                  |
      | 2026-06-18..2026-06-20 |
    And "Siguiente" is enabled
    When I drag from the day "2026-06-16" to the day "2026-06-19"
    Then the dates on the calendar are:
      | dates                  |
      | 2026-06-16..2026-06-17 |
      | 2026-06-18..2026-06-20 |

  Scenario: A range is shortened from its end and removed with a click
    Given I am on the dates step of the creation wizard
    When I drag from the day "2026-06-18" to the day "2026-06-22"
    And I drag from the day "2026-06-22" to the day "2026-06-20"
    Then the dates on the calendar are:
      | dates                  |
      | 2026-06-18..2026-06-20 |
    When I press the day "2026-06-19"
    Then no date is marked on the calendar
    And "Siguiente" is disabled

  Scenario: A range is made with the keyboard alone, across two months
    Given I am on the dates step of the creation wizard
    When I reach the days of the calendar with the Tab key
    And I press the key "ArrowDown" 2 times
    And I press the key "Shift+Enter" 1 time
    Then a tip over the day "2026-06-29" reads "Elige el último día del rango."
    And screen readers hear under the calendar: "Elige el último día del rango."
    When I press the key "ArrowRight" 3 times
    Then the calendar shows "Julio 2026"
    And no tip is shown on the calendar
    And screen readers hear under the calendar: "Elige el último día del rango."
    When I press the key "Enter" 1 time
    Then the dates on the calendar are:
      | dates                  |
      | 2026-06-29..2026-07-02 |
    And screen readers hear nothing under the calendar

  Scenario: A day under the tip is pressed with the mouse as the last day of the range
    Given I am on the dates step of the creation wizard
    When I reach the days of the calendar with the Tab key
    And I press the key "ArrowDown" 2 times
    And I press the key "Shift+Enter" 1 time
    Then a tip over the day "2026-06-29" reads "Elige el último día del rango."
    When I press the day "2026-06-22" where the tip covers it
    Then the dates on the calendar are:
      | dates                  |
      | 2026-06-22..2026-06-29 |
    And no tip is shown on the calendar

  Scenario: A range is saved with its "+" and waits under the calendar
    Given I am on the dates step of the creation wizard
    When I drag from the day "2026-06-22" to the day "2026-06-26"
    Then no "+" is shown on the calendar
    When I move the mouse over the day "2026-06-24"
    And I save the range with its "+"
    Then no date is marked on the calendar
    And the saved ranges are:
      | range           |
      | Lun 22 ➔ Vie 26 |
    And "Siguiente" is enabled

  Scenario: A range that goes on into the next month is saved with the keyboard from its last day on screen
    Given I am on the dates step of the creation wizard
    When I reach the days of the calendar with the Tab key
    And I press the key "ArrowDown" 2 times
    And I press the key "Shift+Enter" 1 time
    And I press the key "ArrowRight" 3 times
    And I press the key "Enter" 1 time
    And I press the key "ArrowLeft" 2 times
    Then the calendar shows "Junio 2026"
    When I press the key "Tab" 1 time
    And I press the key "Enter" 1 time
    Then the saved ranges are:
      | range          |
      | Lun 29 ➔ Jue 2 |
    And no date is marked on the calendar
    And the focus is on the day "2026-06-30"

  Scenario: A range like a saved one is not marked again, and the saved one is shown
    Given I am on the dates step of the creation wizard
    When I drag from the day "2026-06-22" to the day "2026-06-26"
    And I move the mouse over the day "2026-06-24"
    And I save the range with its "+"
    And I drag from the day "2026-06-22" to the day "2026-06-26"
    Then no date is marked on the calendar
    And the saved ranges are:
      | range           |
      | Lun 22 ➔ Vie 26 |
    And the saved range "Lun 22 ➔ Vie 26" is shown on the calendar
    And screen readers hear nothing under the calendar

  Scenario: A saved range is seen on the calendar from its pill and deleted with its "−"
    Given I am on the dates step of the creation wizard
    When I drag from the day "2026-06-22" to the day "2026-06-26"
    And I move the mouse over the day "2026-06-24"
    And I save the range with its "+"
    And I press the saved range "Lun 22 ➔ Vie 26"
    Then the saved range "Lun 22 ➔ Vie 26" is shown on the calendar
    When I press the key "Escape" 1 time
    Then the saved range "Lun 22 ➔ Vie 26" is not shown on the calendar
    When I press the saved range "Lun 22 ➔ Vie 26"
    And I press the day "2026-06-10", which cannot be chosen
    Then the saved range "Lun 22 ➔ Vie 26" is not shown on the calendar
    When I delete the saved range "Lun 22 ➔ Vie 26"
    Then there are no saved ranges
    And "Siguiente" is disabled

  Scenario: The trash clears every date and saved range at once
    Given I am on the dates step of the creation wizard
    Then there is no trash under the calendar
    When I press the day "2026-06-20"
    And I drag from the day "2026-06-22" to the day "2026-06-26"
    And I move the mouse over the day "2026-06-24"
    And I save the range with its "+"
    And I drag from the day "2026-06-29" to the day "2026-06-30"
    And I press the trash
    And I answer the trash "Sí"
    Then no date is marked on the calendar
    And there are no saved ranges
    And there is no trash under the calendar
    And the calendar shows "Junio 2026"
    And "Siguiente" is disabled

  Scenario: The trash goes with the last saved range
    Given I am on the dates step of the creation wizard
    When I drag from the day "2026-06-22" to the day "2026-06-26"
    And I move the mouse over the day "2026-06-24"
    And I save the range with its "+"
    And I delete the saved range "Lun 22 ➔ Vie 26"
    Then there is no trash under the calendar

  Scenario: The options are counted from 50 on and the 61st is not marked
    Given I am on the dates step of the creation wizard
    When I mark the 49 days from "2026-06-15"
    Then no options counter is shown
    When I press the day "2026-08-03"
    Then the options counter reads "50 de 60 opciones"
    And screen readers hear nothing under the calendar
    When I mark the 10 days from "2026-08-04"
    Then the options counter reads "60 de 60 opciones"
    And screen readers hear nothing under the calendar
    When I press the day "2026-08-14"
    Then the day "2026-08-14" is not marked
    And the options counter reads "60 de 60 opciones"
    When I press the day "2026-08-13"
    Then the options counter reads "59 de 60 opciones"
    And screen readers hear nothing under the calendar

  Scenario: The "Horario" switch is there only while a date of its own is marked
    Given I am on the dates step of the creation wizard
    Then there is no "Horario" switch
    When I drag from the day "2026-06-22" to the day "2026-06-26"
    Then there is no "Horario" switch
    When I press the day "2026-06-20"
    Then the "Horario" switch is off
    And the "Horario" switch is under the calendar, its right side over that of "Siguiente"
    When I turn the "Horario" switch on
    Then the "Horario" switch is on
    When I press the day "2026-06-20"
    Then there is no "Horario" switch
    When I press the day "2026-06-18"
    Then the "Horario" switch is on

  Scenario: The "Horario" switch is used with the keyboard and kept while visiting step 1
    Given I am on the dates step of the creation wizard
    When I press the day "2026-06-20"
    And I reach the "Horario" switch with the Tab key
    And I press the key "Space" 1 time
    Then the "Horario" switch is on
    When I go back to step 1 and on to the dates again
    Then the "Horario" switch is on

  @touch
  Scenario: With a finger, the "Horario" switch is between the two arrows
    Given I am on the dates step of the creation wizard
    When I press the day "2026-06-20"
    Then the "Horario" switch is between the two arrows, beside "Siguiente"
    When I turn the "Horario" switch on
    Then the "Horario" switch is on

  @touch
  Scenario: With a finger, a range is drawn, saved with the "+" button and deleted from its pill
    Given I am on the dates step of the creation wizard
    When I rest a finger on the day "2026-06-22" and slide it to the day "2026-06-26"
    Then the dates on the calendar are:
      | dates                  |
      | 2026-06-22..2026-06-26 |
    And no "+" is shown on the calendar
    When I press the button "Guardar un rango" under the calendar
    And I save the range with its "+"
    Then no date is marked on the calendar
    And the saved ranges are:
      | range           |
      | Lun 22 ➔ Vie 26 |
    And no "+" is shown on the calendar
    And the saved range "Lun 22 ➔ Vie 26" has no "−"
    When I press the saved range "Lun 22 ➔ Vie 26"
    And I delete the saved range "Lun 22 ➔ Vie 26" with the "−" on its pill
    Then there are no saved ranges

  Scenario Outline: The trash asks before it clears, <with>
    Given I am on the dates step of the creation wizard
    When I press the day "2026-06-20"
    And I press the trash
    Then the trash asks "¿Borrar todo?" in its place
    When I answer the trash "No"
    Then the trash is back under the calendar
    And the marked days are:
      | day        |
      | 2026-06-20 |
    When I press the trash
    And I answer the trash "Sí"
    Then no date is marked on the calendar
    And there is no trash under the calendar

    Examples:
      | with         |
      | with a mouse |

    @touch
    Examples:
      | with          |
      | with a finger |

  Scenario: The times step has a column for each date, in the order of the dates
    Given I am on the dates step of the creation wizard
    When I press the day "2026-06-25"
    And I drag from the day "2026-06-22" to the day "2026-06-23"
    And I press the day "2026-06-20"
    And I turn the "Horario" switch on
    And I go on to the times step
    Then I am on step 3
    And the columns of times on screen are:
      | column                 |
      | 2026-06-20             |
      | 2026-06-22..2026-06-23 |
      | 2026-06-25             |
    And the column of "2026-06-22..2026-06-23" reads "Sin horario" and has no times
    And the column of "2026-06-20" shows the 9 hours from "9:00"
    And no time is marked on "2026-06-20"

  Scenario: A press marks a time on the hour and another press unmarks it
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I press the time "18:00" of "2026-06-20"
    And I press the time "9:00" of "2026-06-20"
    Then the times marked on "2026-06-20" are "9:00, 18:00"
    And no time is marked on "2026-06-21"
    When I press the time "18:00" of "2026-06-20"
    Then the times marked on "2026-06-20" are "9:00"

  Scenario: The arrows of a marked time move it by quarters, from :00 to :45
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I press the time "10:00" of "2026-06-20"
    Then the time "10:00" of "2026-06-20" cannot be moved earlier
    When I move the time "10:00" of "2026-06-20" 3 quarters later
    Then the times marked on "2026-06-20" are "10:45"
    And the time "10:45" of "2026-06-20" cannot be moved later
    When I move the time "10:45" of "2026-06-20" 2 quarters earlier
    Then the times marked on "2026-06-20" are "10:15"
    When I press the time "10:15" of "2026-06-20"
    Then no time is marked on "2026-06-20"

  Scenario: Without "Horario", "Siguiente" goes on past the times
    Given I am on the dates step of the creation wizard
    When I press the day "2026-06-20"
    And I press "Siguiente" on the dates step
    Then I am on step 3
    And there are no columns of times

  Scenario: Without a date of its own, "Siguiente" goes on past the times
    Given I am on the dates step of the creation wizard
    When I press the day "2026-06-20"
    And I turn the "Horario" switch on
    And I press the day "2026-06-20"
    And I drag from the day "2026-06-22" to the day "2026-06-26"
    And I press "Siguiente" on the dates step
    Then I am on step 3
    And there are no columns of times

  Scenario: The times and the dates are kept while visiting the dates step
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I press the time "18:00" of "2026-06-20"
    And I press the time "9:00" of "2026-06-21"
    And I go back to the dates step
    And I press the day "2026-06-21"
    And I press the day "2026-06-21"
    And I go on to the times step
    Then the times marked on "2026-06-20" are "18:00"
    And no time is marked on "2026-06-21"

  Scenario: The times count as options, on the dates step too, and the 61st is not marked
    Given I am on the dates step of the creation wizard
    When I mark the 49 days from "2026-06-15"
    And I turn the "Horario" switch on
    And I go on to the times step
    And I press the time "9:00" of "2026-06-15"
    Then no options counter is shown
    When I press the time "10:00" of "2026-06-15"
    Then the options counter reads "50 de 60 opciones"
    When I press each hour from 11 to 20 of "2026-06-15"
    Then the options counter reads "60 de 60 opciones"
    When I press the time "21:00" of "2026-06-15"
    Then the times marked on "2026-06-15" are "9:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 16:00, 17:00, 18:00, 19:00, 20:00"
    And the options counter reads "60 de 60 opciones"
    When I press the time "20:00" of "2026-06-15"
    Then the options counter reads "59 de 60 opciones"
    When I go back to the dates step
    Then the options counter reads "59 de 60 opciones"

  Scenario: The step's arrows move the columns one at a time, four on screen
    Given I am on the dates step of the creation wizard
    When I mark the 6 days from "2026-06-20"
    And I turn the "Horario" switch on
    And I go on to the times step
    Then the columns of times on screen are:
      | column     |
      | 2026-06-20 |
      | 2026-06-21 |
      | 2026-06-22 |
      | 2026-06-23 |
    And the place among the columns reads "1 / 3"
    When I press the step's arrow "Día siguiente"
    Then the columns of times on screen are:
      | column     |
      | 2026-06-21 |
      | 2026-06-22 |
      | 2026-06-23 |
      | 2026-06-24 |
    And the place among the columns reads "2 / 3"
    When I press the step's arrow "Día siguiente"
    Then the columns of times on screen are:
      | column     |
      | 2026-06-22 |
      | 2026-06-23 |
      | 2026-06-24 |
      | 2026-06-25 |
    And the place among the columns reads "3 / 3"
    When I press the step's arrow "Día anterior"
    Then the place among the columns reads "2 / 3"
    When I press the step's arrow "Día siguiente"
    And I press the step's arrow "Siguiente"
    Then I am on step 4
    And there are no columns of times

  Scenario: A held arrow goes on moving the columns and stops at the last, without leaving the step
    Given I am on the dates step of the creation wizard
    When I mark the 7 days from "2026-06-20"
    And I turn the "Horario" switch on
    And I go on to the times step
    And I hold the step's arrow "Día siguiente" down
    Then the place among the columns reads "4 / 4"
    When I let the arrow go half a second later
    Then I am on step 3
    And the columns of times on screen are:
      | column     |
      | 2026-06-23 |
      | 2026-06-24 |
      | 2026-06-25 |
      | 2026-06-26 |
    When I press the step's arrow "Siguiente"
    Then I am on step 4

  Scenario: The times are marked and moved with the keyboard alone
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I reach the times with the Tab key
    Then the focus is on the time "9:00" of "2026-06-20"
    When I press the key "ArrowDown" 2 times
    And I press the key "Enter" 1 time
    Then the times marked on "2026-06-20" are "11:00"
    When I press the key "ArrowRight" 2 times
    And I press the key "ArrowLeft" 1 time
    Then the times marked on "2026-06-20" are "11:15"
    And the focus is on the time "11:15" of "2026-06-20"
    When I press the key "Tab" 1 time
    Then the focus is on the time "9:00" of "2026-06-21"
    When I press the key "Space" 1 time
    Then the times marked on "2026-06-21" are "9:00"

  @touch
  Scenario: With a finger, three columns on screen and the whole step on a short screen
    Given the screen measures 375 by 667
    And I am on the dates step of the creation wizard
    When I mark the 4 days from "2026-06-20"
    And I turn the "Horario" switch on
    And I go on to the times step
    Then the columns of times on screen are:
      | column     |
      | 2026-06-20 |
      | 2026-06-21 |
      | 2026-06-22 |
    And the place among the columns reads "1 / 2"
    And the step ends above the bottom of the screen
    When I press the time "9:00" of "2026-06-20"
    And I move the time "9:00" of "2026-06-20" 1 quarter later
    Then the times marked on "2026-06-20" are "9:15"
    And the arrows of the time "9:15" of "2026-06-20" are the two ends of its band
    When I press the step's arrow "Día siguiente"
    Then the columns of times on screen are:
      | column     |
      | 2026-06-21 |
      | 2026-06-22 |
      | 2026-06-23 |
    When I press the step's arrow "Día anterior"
    Then the times marked on "2026-06-20" are "9:15"

  @wip
  Scenario: A deadline after the first date warns but does not block
    Given I am signed in as "ana@example.com" with the name "Ana"
    And I have chosen the date "2026-07-06"
    When I set the deadline to "2026-07-08"
    Then I see a warning that the deadline is after the first date
    And I can still create the event

  @wip
  Scenario: The API enforces the option limits
    Given I am signed in as "ana@example.com" with the name "Ana"
    When the API is asked to create an event with 61 options
    Then it answers 400 and no event is created
    When the API is asked to create an event with a date on "2027-07-01"
    Then it answers 400 and no event is created
    When the API is asked to create an event with two equal options
    Then it answers 400 and no event is created
    When the API is asked to create an event with the time range "20:00-19:00"
    Then it answers 400 and no event is created

  @wip
  Scenario: A server error keeps the wizard
    Given I am signed in as "ana@example.com" with the name "Ana"
    And the API will fail the next request
    When I press "Crear"
    Then I see an error with "Reintentar"
    And the wizard still holds everything I entered
